using System.Text.Json;
using Microsoft.Extensions.Logging;
using ReelRoulette.Core.Library;
using ReelRoulette.Core.Storage;

namespace ReelRoulette.Server.Services;

public static class LibraryCatalogBackup
{
    private static readonly object Gate = new();
    private static readonly object ScheduleGate = new();
    private static readonly Dictionary<string, Schedule> Schedules = new(StringComparer.OrdinalIgnoreCase);
    private static Task _pending = Task.CompletedTask;

    public static void Attach(LibraryCatalogSession session, string appDataDirectory, ILogger logger)
    {
        session.AfterSuccessfulWrite = () => Queue(session.DatabasePath, appDataDirectory, logger);
        TryCreate(session.DatabasePath, appDataDirectory, logger);
    }

    internal static IDisposable Defer(string databasePath)
    {
        lock (ScheduleGate)
        {
            Get(databasePath).DeferDepth++;
        }

        return new DeferScope(databasePath);
    }

    internal static void WaitForPending()
    {
        Task pending;
        lock (ScheduleGate)
        {
            pending = _pending;
        }

        pending.GetAwaiter().GetResult();
    }

    private static void Queue(string databasePath, string appDataDirectory, ILogger logger)
    {
        lock (ScheduleGate)
        {
            var schedule = Get(databasePath);
            schedule.AppDataDirectory = appDataDirectory;
            schedule.Logger = logger;
            schedule.Epoch++;
            schedule.Dirty = true;
            ConsiderStart(databasePath, schedule);
        }
    }

    public static void TryCreate(string databasePath, string appDataDirectory, ILogger logger)
    {
        _ = CreateBackup(databasePath, appDataDirectory, logger);
    }

    private static void ConsiderStart(string databasePath, Schedule schedule)
    {
        if (schedule.CopyRunning || schedule.DeferDepth > 0 || !schedule.Dirty)
        {
            return;
        }

        if (string.IsNullOrEmpty(schedule.AppDataDirectory) || schedule.Logger == null)
        {
            return;
        }

        var settings = ReadSettings(schedule.AppDataDirectory);
        if (!settings.Enabled)
        {
            schedule.Dirty = false;
            CancelGapRetry(schedule);
            return;
        }

        if (GapStillBlocks(schedule, settings.MinimumBackupGapMinutes, out var retryAt))
        {
            ArmGapRetry(schedule, databasePath, retryAt);
            return;
        }

        CancelGapRetry(schedule);
        schedule.CopyRunning = true;
        var appDataDirectory = schedule.AppDataDirectory;
        var logger = schedule.Logger;
        var work = Task.Run(() => RunAttempt(databasePath, appDataDirectory, logger));
        _pending = Task.WhenAll(_pending, work).ContinueWith(
            static completed =>
            {
                _ = completed.Exception;
            },
            CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);
    }

    private static void RunAttempt(string databasePath, string appDataDirectory, ILogger logger)
    {
        var result = CreateBackup(databasePath, appDataDirectory, logger);
        lock (ScheduleGate)
        {
            var schedule = Get(databasePath);
            schedule.CopyRunning = false;
            if (result.Disposition == BackupDisposition.Blocked &&
                result.RetryAtUtc is DateTime retryAt &&
                schedule.Dirty)
            {
                ArmGapRetry(schedule, databasePath, retryAt);
                return;
            }

            if (result.Disposition == BackupDisposition.Failed)
            {
                return;
            }

            ConsiderStart(databasePath, schedule);
        }
    }

    private static BackupResult CreateBackup(string databasePath, string appDataDirectory, ILogger logger)
    {
        try
        {
            var settings = ReadSettings(appDataDirectory);
            if (!settings.Enabled || !File.Exists(databasePath))
            {
                lock (ScheduleGate)
                {
                    var schedule = Get(databasePath);
                    schedule.Dirty = false;
                    CancelGapRetry(schedule);
                }

                return new BackupResult(BackupDisposition.Skipped, null);
            }

            var backupDirectory = Path.Combine(appDataDirectory, "backups");
            long epoch;
            lock (ScheduleGate)
            {
                epoch = Get(databasePath).Epoch;
            }

            DateTime? snapshotNewest = null;
            string snapshotSignature;
            DateTime? retryAt = null;
            var blocked = false;
            lock (Gate)
            {
                Directory.CreateDirectory(backupDirectory);
                var existing = ListCatalogBackups(backupDirectory);
                var gap = TimeSpan.FromMinutes(Math.Max(1, settings.MinimumBackupGapMinutes));
                if (existing.Count > 0)
                {
                    var newestUtc = BackupFileNaming.GetFileOrderingUtcTimestamp(existing[^1]);
                    if (DateTime.UtcNow - newestUtc < gap)
                    {
                        blocked = true;
                        snapshotNewest = newestUtc;
                        retryAt = newestUtc + gap;
                    }
                }

                if (!blocked)
                {
                    var backupPath = Path.Combine(backupDirectory, "library.db.backup." + BackupFileNaming.FormatNowForBackupSuffix());
                    LibraryCatalogStore.WriteCheckpoint(databasePath, backupPath);
                    existing = ListCatalogBackups(backupDirectory);
                    while (existing.Count > Math.Max(1, settings.NumberOfBackups))
                    {
                        var oldest = existing[0];
                        existing.RemoveAt(0);
                        DeleteCheckpoint(oldest.FullName);
                    }

                    snapshotNewest = existing.Count == 0
                        ? null
                        : BackupFileNaming.GetFileOrderingUtcTimestamp(existing[^1]);
                    AppendLog(appDataDirectory, logger, "info", $"Catalog backup written to {backupPath}.");
                }

                snapshotSignature = FolderSignature(backupDirectory);
            }

            RememberSnapshot(databasePath, snapshotNewest, snapshotSignature);
            if (blocked)
            {
                return new BackupResult(BackupDisposition.Blocked, retryAt);
            }

            lock (ScheduleGate)
            {
                var schedule = Get(databasePath);
                if (schedule.Epoch == epoch)
                {
                    schedule.Dirty = false;
                }
            }

            return new BackupResult(BackupDisposition.Wrote, null);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Catalog backup failed for {DatabasePath}.", databasePath);
            AppendLog(appDataDirectory, logger, "error", "Catalog backup failed: " + ex.Message);
            lock (ScheduleGate)
            {
                var schedule = Get(databasePath);
                schedule.Dirty = true;
                CancelGapRetry(schedule);
            }

            return new BackupResult(BackupDisposition.Failed, null);
        }
    }

    private static bool GapStillBlocks(Schedule schedule, int minimumBackupGapMinutes, out DateTime retryAt)
    {
        retryAt = DateTime.MaxValue;
        if (schedule.FolderSignature == null ||
            schedule.NewestHealthyUtc == null ||
            schedule.FolderSignature != FolderSignature(Path.Combine(schedule.AppDataDirectory, "backups")))
        {
            return false;
        }

        var gap = TimeSpan.FromMinutes(Math.Max(1, minimumBackupGapMinutes));
        if (DateTime.UtcNow - schedule.NewestHealthyUtc.Value >= gap)
        {
            return false;
        }

        retryAt = schedule.NewestHealthyUtc.Value + gap;
        return true;
    }

    private static void ArmGapRetry(Schedule schedule, string databasePath, DateTime eligibleUtc)
    {
        if (schedule.GapRetry != null && schedule.RetryAtUtc is DateTime existing && existing <= eligibleUtc)
        {
            return;
        }

        CancelGapRetry(schedule);
        var cts = new CancellationTokenSource();
        schedule.GapRetry = cts;
        schedule.RetryAtUtc = eligibleUtc;
        var delay = eligibleUtc - DateTime.UtcNow;
        if (delay < TimeSpan.Zero)
        {
            delay = TimeSpan.Zero;
        }

        _ = Task.Delay(delay, cts.Token).ContinueWith(
            completed =>
            {
                if (completed.IsCanceled)
                {
                    return;
                }

                lock (ScheduleGate)
                {
                    if (!ReferenceEquals(schedule.GapRetry, cts))
                    {
                        return;
                    }

                    schedule.GapRetry = null;
                    schedule.RetryAtUtc = null;
                    ConsiderStart(databasePath, schedule);
                }
            },
            CancellationToken.None,
            TaskContinuationOptions.None,
            TaskScheduler.Default);
    }

    private static void CancelGapRetry(Schedule schedule)
    {
        var retry = schedule.GapRetry;
        schedule.GapRetry = null;
        schedule.RetryAtUtc = null;
        if (retry == null)
        {
            return;
        }

        try
        {
            retry.Cancel();
        }
        catch (ObjectDisposedException)
        {
        }
    }

    private static void RememberSnapshot(string databasePath, DateTime? newestHealthyUtc, string signature)
    {
        lock (ScheduleGate)
        {
            var schedule = Get(databasePath);
            schedule.NewestHealthyUtc = newestHealthyUtc;
            schedule.FolderSignature = signature;
        }
    }

    private static Schedule Get(string databasePath)
    {
        if (!Schedules.TryGetValue(databasePath, out var schedule))
        {
            schedule = new Schedule();
            Schedules[databasePath] = schedule;
        }

        return schedule;
    }

    private static string FolderSignature(string backupDirectory)
    {
        if (!Directory.Exists(backupDirectory))
        {
            return string.Empty;
        }

        var parts = new List<string>();
        foreach (var path in Directory.GetFiles(backupDirectory, "library.db.backup.*"))
        {
            if (IsSidecar(path))
            {
                continue;
            }

            var stamp = BackupFileNaming.GetFileOrderingUtcTimestamp(new FileInfo(path)).Ticks;
            parts.Add(Path.GetFileName(path) + ":" + stamp.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }

        parts.Sort(StringComparer.Ordinal);
        return string.Join("|", parts);
    }

    private static bool IsSidecar(string path)
    {
        return path.EndsWith("-wal", StringComparison.Ordinal) ||
               path.EndsWith("-shm", StringComparison.Ordinal) ||
               path.EndsWith("-journal", StringComparison.Ordinal);
    }

    private enum BackupDisposition
    {
        Wrote,
        Blocked,
        Skipped,
        Failed
    }

    private readonly record struct BackupResult(BackupDisposition Disposition, DateTime? RetryAtUtc);

    private sealed class Schedule
    {
        public string AppDataDirectory { get; set; } = string.Empty;
        public ILogger? Logger { get; set; }
        public long Epoch { get; set; }
        public bool Dirty { get; set; }
        public bool CopyRunning { get; set; }
        public int DeferDepth { get; set; }
        public DateTime? NewestHealthyUtc { get; set; }
        public string? FolderSignature { get; set; }
        public CancellationTokenSource? GapRetry { get; set; }
        public DateTime? RetryAtUtc { get; set; }
    }

    private sealed class DeferScope : IDisposable
    {
        private readonly string _databasePath;
        private int _disposed;

        public DeferScope(string databasePath)
        {
            _databasePath = databasePath;
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0)
            {
                return;
            }

            lock (ScheduleGate)
            {
                var schedule = Get(_databasePath);
                if (schedule.DeferDepth > 0)
                {
                    schedule.DeferDepth--;
                }

                if (schedule.DeferDepth == 0)
                {
                    ConsiderStart(_databasePath, schedule);
                }
            }
        }
    }

    private static (bool Enabled, int MinimumBackupGapMinutes, int NumberOfBackups) ReadSettings(string appDataDirectory)
    {
        var enabled = true;
        var gap = 360;
        var count = 8;
        var path = Path.Combine(appDataDirectory, "core-settings.json");
        if (!File.Exists(path))
        {
            return (enabled, gap, count);
        }

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            if (!document.RootElement.TryGetProperty("backup", out var backup) ||
                backup.ValueKind != JsonValueKind.Object)
            {
                return (enabled, gap, count);
            }

            if (backup.TryGetProperty("enabled", out var enabledValue) &&
                enabledValue.ValueKind is JsonValueKind.True or JsonValueKind.False)
            {
                enabled = enabledValue.GetBoolean();
            }

            if (backup.TryGetProperty("minimumBackupGapMinutes", out var gapValue) &&
                gapValue.TryGetInt32(out var gapMinutes))
            {
                gap = Math.Clamp(gapMinutes, 1, 10080);
            }

            if (backup.TryGetProperty("numberOfBackups", out var countValue) &&
                countValue.TryGetInt32(out var backups))
            {
                count = Math.Clamp(backups, 1, 100);
            }
        }
        catch (JsonException)
        {
            return (true, 360, 8);
        }

        return (enabled, gap, count);
    }

    private static List<FileInfo> ListCatalogBackups(string backupDirectory)
    {
        var healthy = new List<FileInfo>();
        foreach (var path in Directory.GetFiles(backupDirectory, "library.db.backup.*"))
        {
            if (path.EndsWith("-wal", StringComparison.Ordinal) ||
                path.EndsWith("-shm", StringComparison.Ordinal) ||
                path.EndsWith("-journal", StringComparison.Ordinal))
            {
                continue;
            }

            switch (LibraryCatalogStore.InspectCatalogFile(path))
            {
                case LibraryCatalogStore.CatalogFileInspection.NotADatabase:
                    DeleteCheckpoint(path);
                    continue;
                case LibraryCatalogStore.CatalogFileInspection.Unavailable:
                    continue;
                default:
                    healthy.Add(new FileInfo(path));
                    break;
            }
        }

        return healthy
            .OrderBy(BackupFileNaming.GetFileOrderingUtcTimestamp)
            .ToList();
    }

    private static void DeleteCheckpoint(string path)
    {
        DeleteIfExists(path);
        DeleteIfExists(path + "-wal");
        DeleteIfExists(path + "-shm");
        DeleteIfExists(path + "-journal");
    }

    private static void DeleteIfExists(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    private static void AppendLog(string appDataDirectory, ILogger logger, string level, string message)
    {
        new ServerLogService(appDataDirectory, logger).Append(level, message);
    }
}
