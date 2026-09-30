using System.Text.Json;
using Microsoft.Extensions.Logging;
using ReelRoulette.Core.Library;
using ReelRoulette.Core.Storage;

namespace ReelRoulette.Server.Services;

public static class LibraryCatalogBackup
{
    private static readonly object Gate = new();
    private static readonly object ScheduleGate = new();
    private static Task _pending = Task.CompletedTask;

    public static void Attach(LibraryCatalogSession session, string appDataDirectory, ILogger logger)
    {
        session.AfterSuccessfulWrite = () => Queue(session.DatabasePath, appDataDirectory, logger);
        TryCreate(session.DatabasePath, appDataDirectory, logger);
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
        var work = Task.Run(() => TryCreate(databasePath, appDataDirectory, logger));
        lock (ScheduleGate)
        {
            _pending = Task.WhenAll(_pending, work).ContinueWith(
                static completed =>
                {
                    _ = completed.Exception;
                },
                CancellationToken.None,
                TaskContinuationOptions.ExecuteSynchronously,
                TaskScheduler.Default);
        }
    }

    public static void TryCreate(string databasePath, string appDataDirectory, ILogger logger)
    {
        lock (Gate)
        {
            try
            {
                var settings = ReadSettings(appDataDirectory);
                if (!settings.Enabled || !File.Exists(databasePath))
                {
                    return;
                }

                var backupDirectory = Path.Combine(appDataDirectory, "backups");
                Directory.CreateDirectory(backupDirectory);
                var existing = ListCatalogBackups(backupDirectory);
                var gap = TimeSpan.FromMinutes(Math.Max(1, settings.MinimumBackupGapMinutes));
                if (existing.Count > 0 &&
                    DateTime.UtcNow - BackupFileNaming.GetFileOrderingUtcTimestamp(existing[^1]) < gap)
                {
                    return;
                }

                var backupPath = Path.Combine(backupDirectory, "library.db.backup." + BackupFileNaming.FormatNowForBackupSuffix());
                LibraryCatalogStore.WriteCheckpoint(databasePath, backupPath);
                existing.Add(new FileInfo(backupPath));
                while (existing.Count > Math.Max(1, settings.NumberOfBackups))
                {
                    var oldest = existing[0];
                    existing.RemoveAt(0);
                    DeleteCheckpoint(oldest.FullName);
                }

                AppendLog(appDataDirectory, "info", $"Catalog backup written to {backupPath}.");
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Catalog backup failed for {DatabasePath}.", databasePath);
                AppendLog(appDataDirectory, "error", "Catalog backup failed: " + ex.Message);
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

    private static void AppendLog(string appDataDirectory, string level, string message)
    {
        try
        {
            File.AppendAllText(
                Path.Combine(appDataDirectory, "last.log"),
                $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [server] [{level}] {message}{Environment.NewLine}");
        }
        catch (IOException)
        {
        }
    }
}
