using System.Buffers.Binary;
using System.Globalization;
using System.Runtime.InteropServices;
using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Storage;

namespace ReelRoulette.Core.Library;

public enum LibraryCatalogOpenStatus
{
    Opened,

    /// <summary>
    /// The live catalog could not be used and was moved aside to <c>library.db.refused</c>, or a refused
    /// file from an earlier open keeps an empty catalog from being created.
    /// </summary>
    Refused,

    /// <summary>
    /// <c>library.db</c>, <c>library.db.previous</c>, or <c>library.db.incoming</c> was written by a newer
    /// build. Nothing was changed.
    /// </summary>
    Newer,

    /// <summary>
    /// There is no <c>library.db</c>, but catalog backups exist, so no empty catalog was created.
    /// </summary>
    Missing,

    /// <summary>
    /// <c>library.db</c>, <c>library.db.previous</c>, or <c>library.db.incoming</c> could not be read to
    /// tell whether a newer build wrote it. Nothing was changed.
    /// </summary>
    Unreadable
}

/// <summary>
/// A catalog file in the data folder was written by a newer build, so it was left unchanged.
/// </summary>
public sealed class LibraryCatalogNewerException : InvalidOperationException
{
    public LibraryCatalogNewerException()
        : base(LibraryCatalogStore.NewerMessage)
    {
    }
}

/// <summary>
/// A catalog file in the data folder could not be read to tell whether a newer build wrote it, so it
/// was left unchanged.
/// </summary>
public sealed class LibraryCatalogUnreadableException : InvalidOperationException
{
    public LibraryCatalogUnreadableException()
        : base(LibraryCatalogStore.UnreadableMessage)
    {
    }
}

public sealed class LibraryCatalogReplaceOptions
{
    public bool StopAfterMovingPrevious { get; init; }

    public bool StopAfterPublishingIncoming { get; init; }

    public bool RetainPrevious { get; init; }
}

public readonly struct LibraryCatalogRemapResult
{
    public bool Success { get; init; }
    public string? ErrorMessage { get; init; }

    public static LibraryCatalogRemapResult Ok() => new() { Success = true };

    public static LibraryCatalogRemapResult Fail(string message) =>
        new() { Success = false, ErrorMessage = message };
}

public sealed class LibraryCatalogOpenResult
{
    public LibraryCatalogOpenStatus Status { get; init; }
    public string? Message { get; init; }
    public LibraryCatalogSession? Session { get; init; }
}

public sealed class LibraryCatalogSnapshot
{
    public IReadOnlyList<LibraryCatalogSource> Sources { get; init; } = [];
    public IReadOnlyList<LibraryCatalogItem> Items { get; init; } = [];
    public IReadOnlyList<LibraryCatalogCategory> Categories { get; init; } = [];
    public IReadOnlyList<LibraryCatalogTag> Tags { get; init; } = [];
}

public sealed class LibraryCatalogSource
{
    public string Id { get; init; } = string.Empty;
    public string RootPath { get; init; } = string.Empty;
    public string RootPathFold { get; init; } = string.Empty;
    public string? DisplayName { get; init; }
    public bool IsEnabled { get; init; }
}

public sealed class LibraryCatalogCategory
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public int SortOrder { get; init; }
}

public sealed class LibraryCatalogTag
{
    public string Name { get; init; } = string.Empty;
    public string NameFold { get; init; } = string.Empty;
    public string CategoryId { get; init; } = string.Empty;
}

public sealed class LibraryCatalogItem
{
    public string Id { get; init; } = string.Empty;
    public string SourceId { get; init; } = string.Empty;
    public string FullPath { get; init; } = string.Empty;
    public string FullPathFold { get; init; } = string.Empty;
    public string RelativePath { get; init; } = string.Empty;
    public string RelativePathFold { get; init; } = string.Empty;
    public string FileName { get; init; } = string.Empty;
    public string FileNameFold { get; init; } = string.Empty;
    public long? DurationTicks { get; init; }
    public bool? HasAudio { get; init; }
    public double? IntegratedLoudness { get; init; }
    public double? PeakDb { get; init; }
    public bool IsFavorite { get; init; }
    public bool IsBlacklisted { get; init; }
    public int PlayCount { get; init; }
    public DateTime? LastPlayedUtc { get; init; }
    public int MediaType { get; init; }
    public string? Fingerprint { get; init; }
    public string FingerprintAlgorithm { get; init; } = string.Empty;
    public int FingerprintVersion { get; init; }
    public long? FileSizeBytes { get; init; }
    public DateTime? LastWriteTimeUtc { get; init; }
    public DateTime? FingerprintLastUtc { get; init; }
    public int? FingerprintStatus { get; init; }
    public string? LoudnessError { get; init; }
    public string? ThumbnailRevision { get; init; }
    public int? ThumbnailWidth { get; init; }
    public int? ThumbnailHeight { get; init; }
    public IReadOnlyList<string> Tags { get; internal set; } = [];
}

public sealed class LibraryCatalogPreset
{
    public string Name { get; init; } = string.Empty;
    public string FilterStateJson { get; init; } = "{}";
}

public static class LibraryCatalogStore
{
    public const int SchemaVersion = 2;
    public const string DatabaseFileName = "library.db";
    public const string IncomingFileName = "library.db.incoming";
    public const string PreviousFileName = "library.db.previous";
    public const string BackupDirectoryName = "backups";
    public const string BackupFilePrefix = "library.db.backup.";
    public const string RefusedMessage =
        "The library is damaged and was moved aside to library.db.refused. Restore a backup from the backups folder, or, if there are no backups, move the refused file out of the data folder to start with an empty library.";
    public const string NewerMessage =
        "The library was saved by a newer version of ReelRoulette and was left unchanged. Update ReelRoulette to open it.";
    public const string MissingMessage =
        "No library was found, but the backups folder has library backups, so an empty library was not created. Restore a backup, or move the library backups out of the backups folder to start with an empty library.";
    public const string UnreadableMessage =
        "A library file in the data folder could not be read, so the library was left unchanged. Make sure no other program has it open and ReelRoulette can read the data folder, then restart ReelRoulette.";

    internal const uint WindowsPublishMoveFlags = 0x8;

    private const int SqliteNotADatabase = 26;
    private const int SqliteCorrupt = 11;
    private const int SqliteHeaderLength = 100;
    private const int SqliteUserVersionOffset = 60;
    private static readonly byte[] SqliteHeaderMagic = "SQLite format 3\0"u8.ToArray();

    private const string CreatingFileName = "library.db.creating";
    private const string RefusedFileName = "library.db.refused";
    internal const string UncategorizedCategoryId = "uncategorized";
    internal const string UncategorizedCategoryName = "Uncategorized";

    private static readonly string[] Schema2Tables =
    [
        "sources",
        "items",
        "categories",
        "tags",
        "item_tags",
        "presets",
        "catalog_meta"
    ];

    private static readonly string[] Schema2ItemColumns =
    [
        "loudness_error",
        "thumbnail_revision",
        "thumbnail_width",
        "thumbnail_height"
    ];

    public static LibraryCatalogOpenResult Open(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        Directory.CreateDirectory(directory);
        switch (RecoverReplace(directory))
        {
            case CatalogFilesCheck.Newer:
                return Unavailable(LibraryCatalogOpenStatus.Newer, NewerMessage);
            case CatalogFilesCheck.Unreadable:
                return Unavailable(LibraryCatalogOpenStatus.Unreadable, UnreadableMessage);
        }

        var databasePath = Path.Combine(directory, DatabaseFileName);
        if (File.Exists(databasePath))
        {
            switch (CheckCatalogFile(databasePath))
            {
                case CatalogFileState.Usable:
                    return Opened(databasePath);
                case CatalogFileState.Unreadable:
                    return Unavailable(LibraryCatalogOpenStatus.Unreadable, UnreadableMessage);
            }

            Quarantine(databasePath);
            return Unavailable(LibraryCatalogOpenStatus.Refused, RefusedMessage);
        }

        // An empty catalog is only for a fresh install. A refused file or a backup means there was a
        // library here, and an empty one would let the next completed refresh delete its thumbnails.
        if (Directory.EnumerateFiles(directory, RefusedFileName + "*").Any())
        {
            return Unavailable(LibraryCatalogOpenStatus.Refused, RefusedMessage);
        }

        var backupDirectory = Path.Combine(directory, BackupDirectoryName);
        if (Directory.Exists(backupDirectory) && Directory.EnumerateFiles(backupDirectory, BackupFilePrefix + "*").Any())
        {
            return Unavailable(LibraryCatalogOpenStatus.Missing, MissingMessage);
        }

        CreateEmpty(directory, databasePath);
        return Opened(databasePath);
    }

    /// <summary>
    /// Whether a newer build wrote the live catalog or a replace file beside it. A newer build may
    /// still need them, so this build changes none of them, and none of them either when one cannot
    /// be read to tell.
    /// </summary>
    private static CatalogFilesCheck CheckNewerCatalog(string directory)
    {
        return CheckNewerFiles(
            Path.Combine(directory, DatabaseFileName),
            Path.Combine(directory, PreviousFileName),
            Path.Combine(directory, IncomingFileName));
    }

    public static void WriteCheckpoint(string sourceDatabasePath, string destinationPath, Action? afterCopyStarted = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sourceDatabasePath);
        ArgumentException.ThrowIfNullOrWhiteSpace(destinationPath);
        var destinationDirectory = Path.GetDirectoryName(destinationPath);
        if (!string.IsNullOrEmpty(destinationDirectory))
        {
            Directory.CreateDirectory(destinationDirectory);
        }

        DeleteSidecars(destinationPath);
        try
        {
            using (var source = new SqliteConnection(ConnectionString(sourceDatabasePath, readOnly: false)))
            using (var destination = new SqliteConnection(ConnectionString(destinationPath, readOnly: false)))
            {
                source.Open();
                source.DefaultTimeout = 5;
                Execute(source, "PRAGMA busy_timeout=5000;");
                destination.Open();
                afterCopyStarted?.Invoke();
                source.BackupDatabase(destination);
            }

            CheckpointStandalone(destinationPath);
            if (!IsHealthyFile(destinationPath))
            {
                throw new InvalidDataException("Catalog checkpoint is not a usable database.");
            }
        }
        catch
        {
            DeleteSidecars(destinationPath);
            throw;
        }
    }

    public static IReadOnlyList<string> ReadSourceRootPaths(string databasePath)
    {
        using var connection = OpenReadOnly(databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT root_path FROM sources ORDER BY position;";
        var roots = new HashSet<string>(StringComparer.Ordinal);
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            if (reader.IsDBNull(0))
            {
                continue;
            }

            var root = reader.GetString(0).Trim();
            if (!string.IsNullOrEmpty(root))
            {
                roots.Add(root);
            }
        }

        var list = roots.ToList();
        list.Sort(StringComparer.Ordinal);
        return list;
    }

    public enum DatabaseContentRead
    {
        HasContent,
        Empty,
        Unreadable
    }

    public static DatabaseContentRead ReadDatabaseContent(string databasePath)
    {
        if (string.IsNullOrWhiteSpace(databasePath) || !File.Exists(databasePath))
        {
            return DatabaseContentRead.Unreadable;
        }

        if (InspectCatalogFile(databasePath) != CatalogFileInspection.Usable)
        {
            return DatabaseContentRead.Unreadable;
        }

        try
        {
            using var connection = OpenReadOnly(databasePath);
            connection.DefaultTimeout = 1;
            var sources = ExecuteScalarInt(connection, "SELECT COUNT(*) FROM sources;");
            var items = ExecuteScalarInt(connection, "SELECT COUNT(*) FROM items;");
            return sources > 0 || items > 0 ? DatabaseContentRead.HasContent : DatabaseContentRead.Empty;
        }
        catch (Exception ex) when (ex is SqliteException or IOException or InvalidDataException)
        {
            return DatabaseContentRead.Unreadable;
        }
    }

    public static void PrepareIncomingFromFile(string directory, string checkpointPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        ArgumentException.ThrowIfNullOrWhiteSpace(checkpointPath);
        Directory.CreateDirectory(directory);
        ThrowIfLeftUnchanged(RecoverReplace(directory));
        var incoming = Path.Combine(directory, IncomingFileName);
        DeleteSidecars(incoming);
        File.Copy(checkpointPath, incoming, overwrite: true);
        CheckpointStandalone(incoming);
        if (!IsHealthyFile(incoming))
        {
            DeleteSidecars(incoming);
            throw new InvalidDataException("Incoming catalog is not a usable database.");
        }

        SyncFile(incoming);
        SyncDirectory(directory);
    }

    public static void DiscardIncoming(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        DeleteSidecars(Path.Combine(directory, IncomingFileName));
    }

    public static void DiscardPrevious(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        DeleteSidecars(Path.Combine(directory, PreviousFileName));
        if (Directory.Exists(directory))
        {
            SyncDirectory(directory);
        }
    }

    public static bool RecoverAndHasLiveDatabase(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        if (!Directory.Exists(directory))
        {
            return false;
        }

        RecoverReplace(directory);
        var live = Path.Combine(directory, DatabaseFileName);
        return File.Exists(live) || Sidecars(live).Any(File.Exists);
    }

    public static bool RestorePrevious(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        var previous = Path.Combine(directory, PreviousFileName);
        if (!File.Exists(previous) && !Sidecars(previous).Any(File.Exists))
        {
            return false;
        }

        RestorePreviousOverLive(directory);
        if (Directory.Exists(directory))
        {
            SyncDirectory(directory);
        }

        return true;
    }

    public static void DeleteLiveDatabase(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        DeleteSidecars(Path.Combine(directory, DatabaseFileName));
        if (Directory.Exists(directory))
        {
            SyncDirectory(directory);
        }
    }

    public static void PublishIncoming(string directory, LibraryCatalogReplaceOptions? options = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        Directory.CreateDirectory(directory);
        var live = Path.Combine(directory, DatabaseFileName);
        var incoming = Path.Combine(directory, IncomingFileName);
        var previous = Path.Combine(directory, PreviousFileName);
        ThrowIfLeftUnchanged(CheckNewerFiles(live, previous));
        if (!IsHealthyFile(incoming))
        {
            throw new InvalidDataException("Incoming catalog is not a usable database.");
        }

        CheckpointStandalone(incoming);
        if (File.Exists(previous) || Sidecars(previous).Any(File.Exists))
        {
            throw new IOException("A previous catalog file is still aside.");
        }

        if (File.Exists(live) || Sidecars(live).Any(File.Exists))
        {
            MoveDatabase(live, previous);
        }

        if (options?.StopAfterMovingPrevious == true)
        {
            return;
        }

        try
        {
            MoveDatabase(incoming, live);
            SyncDirectory(directory);
        }
        catch
        {
            RestorePreviousOverLive(directory);
            throw;
        }

        if (!IsHealthyFile(live))
        {
            RestorePreviousOverLive(directory);
            throw new InvalidDataException("Published catalog is not a usable database.");
        }

        if (options?.StopAfterPublishingIncoming == true || options?.RetainPrevious == true)
        {
            return;
        }

        DeleteSidecars(previous);
        SyncDirectory(directory);
    }

    public static LibraryCatalogRemapResult RemapSources(
        string databasePath,
        IReadOnlyDictionary<string, string> remapByOldRoot,
        IReadOnlySet<string> skippedRoots)
    {
        var remap = new Dictionary<string, string>(remapByOldRoot, StringComparer.Ordinal);
        var skipped = new HashSet<string>(skippedRoots, StringComparer.Ordinal);
        using (var connection = OpenWrite(databasePath))
        using (var transaction = connection.BeginTransaction())
        {

        var sources = new List<(string Id, string Root)>();
        using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = "SELECT id, root_path FROM sources;";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                sources.Add((reader.IsDBNull(0) ? string.Empty : reader.GetString(0), reader.IsDBNull(1) ? string.Empty : reader.GetString(1)));
            }
        }

        var sourceIdToOldRoot = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var skippedIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var newRoots = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (id, rootRaw) in sources)
        {
            var sourceId = id.Trim();
            var oldRoot = rootRaw.Trim();
            if (string.IsNullOrWhiteSpace(sourceId) || string.IsNullOrWhiteSpace(oldRoot))
            {
                continue;
            }

            sourceIdToOldRoot[sourceId] = oldRoot;
            if (skipped.Contains(oldRoot))
            {
                skippedIds.Add(sourceId);
                continue;
            }

            if (remap.TryGetValue(oldRoot, out var newRoot) && !string.IsNullOrWhiteSpace(newRoot))
            {
                newRoots[sourceId] = newRoot.Trim();
                continue;
            }

            return LibraryCatalogRemapResult.Fail(
                $"Source root path is neither skipped nor remapped: '{oldRoot}' (source id '{sourceId}').");
        }

        var items = new List<(string Id, string SourceId, string Relative, string Full)>();
        using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = "SELECT id, source_id, relative_path, full_path FROM items;";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                items.Add((
                    reader.IsDBNull(0) ? string.Empty : reader.GetString(0),
                    reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                    reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                    reader.IsDBNull(3) ? string.Empty : reader.GetString(3)));
            }
        }

        var itemUpdates = new List<(string Id, string Full, string Relative)>();
        foreach (var (id, sourceIdRaw, relativeRaw, fullRaw) in items)
        {
            var sourceId = sourceIdRaw.Trim();
            if (string.IsNullOrWhiteSpace(sourceId))
            {
                continue;
            }

            if (!sourceIdToOldRoot.ContainsKey(sourceId))
            {
                return LibraryCatalogRemapResult.Fail($"Item references unknown sourceId '{sourceId}'.");
            }

            if (skippedIds.Contains(sourceId))
            {
                continue;
            }

            if (!newRoots.TryGetValue(sourceId, out var newRoot))
            {
                continue;
            }

            if (!sourceIdToOldRoot.TryGetValue(sourceId, out var oldRoot))
            {
                return LibraryCatalogRemapResult.Fail($"Item references sourceId '{sourceId}' without a root path.");
            }

            var relativePath = relativeRaw.Trim();
            if (string.IsNullOrWhiteSpace(relativePath))
            {
                return LibraryCatalogRemapResult.Fail($"Item for remapped source '{sourceId}' is missing relativePath.");
            }

            var effectiveRelative = relativePath;
            if (LibraryRelativePath.TryGetLegacyRepairRelativePath(relativePath, oldRoot, fullRaw.Trim(), out var repaired))
            {
                effectiveRelative = repaired;
            }

            string fullPath;
            try
            {
                fullPath = LibraryRelativePath.CombineRootAndRelative(newRoot, effectiveRelative);
            }
            catch (ArgumentException ex)
            {
                return LibraryCatalogRemapResult.Fail(ex.Message);
            }

            itemUpdates.Add((id, fullPath, effectiveRelative));
        }

        foreach (var (id, newRoot) in newRoots)
        {
            Execute(
                connection,
                transaction,
                """
                UPDATE sources
                SET root_path = $root, root_path_fold = $fold
                WHERE id = $id;
                """,
                ("$root", newRoot),
                ("$fold", Fold(newRoot)),
                ("$id", id));
        }

        foreach (var (id, fullPath, relativePath) in itemUpdates)
        {
            Execute(
                connection,
                transaction,
                """
                UPDATE items
                SET full_path = $full, full_path_fold = $fullFold, relative_path = $relative, relative_path_fold = $relativeFold
                WHERE id = $id;
                """,
                ("$full", fullPath),
                ("$fullFold", Fold(fullPath)),
                ("$relative", relativePath),
                ("$relativeFold", Fold(relativePath)),
                ("$id", id));
        }

            transaction.Commit();
        }

        CheckpointStandalone(databasePath);
        return LibraryCatalogRemapResult.Ok();
    }

    public static LibraryCatalogSnapshot Read(string databasePath)
    {
        using var connection = OpenReadOnly(databasePath);
        return ReadSnapshot(connection);
    }

    private static LibraryCatalogOpenResult Opened(string databasePath)
    {
        return new LibraryCatalogOpenResult
        {
            Status = LibraryCatalogOpenStatus.Opened,
            Session = new LibraryCatalogSession(databasePath)
        };
    }

    private static LibraryCatalogOpenResult Unavailable(LibraryCatalogOpenStatus status, string message)
    {
        return new LibraryCatalogOpenResult
        {
            Status = status,
            Message = message
        };
    }

    private static void CreateEmpty(string directory, string databasePath)
    {
        var tempPath = Path.Combine(directory, CreatingFileName);
        DeleteSidecars(tempPath);
        var published = false;
        try
        {
            WriteEmptyDatabase(tempPath);
            SyncFile(tempPath);
            PublishDatabase(tempPath, databasePath);
            published = true;
            SyncDirectory(directory);
        }
        finally
        {
            if (!published)
            {
                DeleteSidecars(tempPath);
            }
        }
    }

    private static void WriteEmptyDatabase(string tempPath)
    {
        using var connection = new SqliteConnection(ConnectionString(tempPath, readOnly: false));
        connection.Open();
        Execute(connection, "PRAGMA journal_mode=WAL;");
        Execute(connection, "PRAGMA synchronous=NORMAL;");

        using var transaction = connection.BeginTransaction();
        Execute(connection, """
            CREATE TABLE sources (
                id TEXT PRIMARY KEY,
                position INTEGER NOT NULL,
                root_path TEXT NOT NULL,
                root_path_fold TEXT NOT NULL,
                display_name TEXT NULL,
                is_enabled INTEGER NOT NULL
            );
            CREATE TABLE items (
                id TEXT PRIMARY KEY,
                position INTEGER NOT NULL,
                source_id TEXT NOT NULL,
                full_path TEXT NOT NULL,
                full_path_fold TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                relative_path_fold TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_name_fold TEXT NOT NULL,
                duration_ticks INTEGER NULL,
                has_audio INTEGER NULL,
                integrated_loudness REAL NULL,
                peak_db REAL NULL,
                is_favorite INTEGER NOT NULL,
                is_blacklisted INTEGER NOT NULL,
                play_count INTEGER NOT NULL,
                last_played_utc INTEGER NULL,
                media_type INTEGER NOT NULL,
                fingerprint TEXT NULL,
                fingerprint_algorithm TEXT NOT NULL,
                fingerprint_version INTEGER NOT NULL,
                file_size_bytes INTEGER NULL,
                last_write_time_utc INTEGER NULL,
                fingerprint_last_utc INTEGER NULL,
                fingerprint_status INTEGER NULL,
                loudness_error TEXT NULL,
                thumbnail_revision TEXT NULL,
                thumbnail_width INTEGER NULL,
                thumbnail_height INTEGER NULL
            );
            CREATE TABLE categories (
                id TEXT PRIMARY KEY,
                position INTEGER NOT NULL,
                name TEXT NOT NULL,
                sort_order INTEGER NOT NULL
            );
            CREATE TABLE tags (
                position INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                name_fold TEXT NOT NULL,
                category_id TEXT NOT NULL
            );
            CREATE TABLE item_tags (
                item_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                name TEXT NOT NULL,
                name_fold TEXT NOT NULL,
                PRIMARY KEY (item_id, position)
            );
            CREATE TABLE presets (
                position INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                name_fold TEXT NOT NULL,
                filter_state TEXT NOT NULL
            );
            CREATE TABLE catalog_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE INDEX idx_sources_root_path_fold ON sources(root_path_fold);
            CREATE INDEX idx_items_full_path_fold ON items(full_path_fold);
            CREATE INDEX idx_items_relative_path_fold ON items(relative_path_fold);
            CREATE INDEX idx_items_file_name_fold ON items(file_name_fold);
            CREATE INDEX idx_tags_name_fold ON tags(name_fold);
            CREATE INDEX idx_item_tags_item_id ON item_tags(item_id);
            CREATE INDEX idx_item_tags_name_fold ON item_tags(name_fold);
            """);

        Execute(
            connection,
            transaction,
            "INSERT INTO categories (id, position, name, sort_order) VALUES ($id, 0, $name, $sort);",
            ("$id", UncategorizedCategoryId),
            ("$name", UncategorizedCategoryName),
            ("$sort", int.MaxValue));
        Execute(connection, transaction, "INSERT INTO catalog_meta (key, value) VALUES ('revision', '0');");
        Execute(connection, transaction, $"PRAGMA user_version = {SchemaVersion};");
        transaction.Commit();
        Execute(connection, "PRAGMA wal_checkpoint(TRUNCATE);");
        connection.Close();
        DeleteIfExists(tempPath + "-wal");
        DeleteIfExists(tempPath + "-shm");
    }

    /// <summary>
    /// The schema check reads only the header and the first page, so a database whose row pages are
    /// corrupt passes it. Reading one row from a later page makes that corruption surface here, where
    /// the usability check counts the file as damaged, instead of at the first query. It reads only the revision row so
    /// startup stays quick on a large catalog; corruption confined to item pages can still pass.
    /// </summary>
    private static void ReadRevisionRow(string databasePath)
    {
        using var connection = OpenReadOnly(databasePath);
        connection.DefaultTimeout = 1;
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT value FROM catalog_meta WHERE key = 'revision';";
        command.ExecuteScalar();
    }

    public enum CatalogFileInspection
    {
        Usable,
        NotADatabase,
        Unavailable,

        /// <summary>A newer build wrote this file.</summary>
        Newer
    }

    public static CatalogFileInspection InspectCatalogFile(string databasePath)
    {
        if (!File.Exists(databasePath))
        {
            return CatalogFileInspection.Unavailable;
        }

        try
        {
            var version = ReadSchemaVersion(databasePath);
            if (version > SchemaVersion)
            {
                return CatalogFileInspection.Newer;
            }

            if (version != SchemaVersion)
            {
                return CatalogFileInspection.NotADatabase;
            }

            using var connection = OpenReadOnly(databasePath);
            connection.DefaultTimeout = 1;
            return HasRequiredCatalogSchema(connection)
                ? CatalogFileInspection.Usable
                : CatalogFileInspection.NotADatabase;
        }
        catch (SqliteException ex) when (ex.SqliteErrorCode == SqliteNotADatabase)
        {
            return CatalogFileInspection.NotADatabase;
        }
        catch (Exception ex) when (ex is SqliteException or IOException or InvalidDataException or UnauthorizedAccessException)
        {
            return CatalogFileInspection.Unavailable;
        }
    }

    /// <summary>Whether this build may change the catalog files, and if not, why.</summary>
    private enum CatalogFilesCheck
    {
        Clear,
        Newer,

        /// <summary>A file could not be read to tell what it is, so it is treated like a newer one and left unchanged.</summary>
        Unreadable
    }

    /// <summary>What SQLite makes of one catalog file.</summary>
    private enum CatalogFileState
    {
        Missing,
        Usable,

        /// <summary>Not a database, corrupt, or without this build's catalog schema.</summary>
        Damaged,

        /// <summary>SQLite could not open or read it at the moment, for example because it is busy or locked, so it may be fine.</summary>
        Unreadable
    }

    /// <summary>
    /// The one usability rule for open, replace recovery, imports, and checkpoints. Only a file that is
    /// not a database, is corrupt, or lacks the catalog schema is damaged, and the revision row is read
    /// too; see <see cref="ReadRevisionRow"/>. One that SQLite cannot open or read at the moment is
    /// unreadable.
    /// </summary>
    private static CatalogFileState CheckCatalogFile(string databasePath)
    {
        if (!File.Exists(databasePath))
        {
            return CatalogFileState.Missing;
        }

        try
        {
            using (var connection = OpenReadOnly(databasePath))
            {
                // This provider treats a timeout of 0 as wait-forever. One second is its shortest finite busy wait.
                connection.DefaultTimeout = 1;
                if (!HasRequiredCatalogSchema(connection))
                {
                    return CatalogFileState.Damaged;
                }
            }

            ReadRevisionRow(databasePath);
            return CatalogFileState.Usable;
        }
        catch (SqliteException ex) when (ex.SqliteErrorCode is SqliteNotADatabase or SqliteCorrupt)
        {
            return CatalogFileState.Damaged;
        }
        catch (Exception ex) when (ex is SqliteException or IOException or UnauthorizedAccessException)
        {
            return CatalogFileState.Unreadable;
        }
    }

    /// <summary>Newer when any file is newer, otherwise unreadable when any file cannot be read.</summary>
    private static CatalogFilesCheck CheckNewerFiles(params string[] databasePaths)
    {
        var result = CatalogFilesCheck.Clear;
        foreach (var databasePath in databasePaths)
        {
            var check = CheckNewerFile(databasePath);
            if (check == CatalogFilesCheck.Newer)
            {
                return CatalogFilesCheck.Newer;
            }

            if (check == CatalogFilesCheck.Unreadable)
            {
                result = CatalogFilesCheck.Unreadable;
            }
        }

        return result;
    }

    private static CatalogFilesCheck CheckNewerFile(string databasePath)
    {
        if (!File.Exists(databasePath))
        {
            return CatalogFilesCheck.Clear;
        }

        try
        {
            return ReadSchemaVersion(databasePath) > SchemaVersion ? CatalogFilesCheck.Newer : CatalogFilesCheck.Clear;
        }
        catch (Exception ex) when (ex is SqliteException or IOException or UnauthorizedAccessException)
        {
            return CatalogFilesCheck.Unreadable;
        }
    }

    private static void ThrowIfLeftUnchanged(CatalogFilesCheck check)
    {
        switch (check)
        {
            case CatalogFilesCheck.Newer:
                throw new LibraryCatalogNewerException();
            case CatalogFilesCheck.Unreadable:
                throw new LibraryCatalogUnreadableException();
        }
    }

    /// <summary>
    /// The file's <c>user_version</c>, or null when it is not a SQLite database. It reads the header
    /// directly, because a read-only SQLite open of a WAL database creates <c>-wal</c> and <c>-shm</c>
    /// files beside it. Only when a <c>-wal</c> file with content is already there, where a newer
    /// header may be waiting to be checkpointed, does it read through SQLite.
    /// </summary>
    private static int? ReadSchemaVersion(string databasePath)
    {
        var wal = new FileInfo(databasePath + "-wal");
        if (wal.Exists && wal.Length > 0)
        {
            try
            {
                using var connection = OpenReadOnly(databasePath);
                connection.DefaultTimeout = 1;
                return ExecuteScalarInt(connection, "PRAGMA user_version;");
            }
            catch (SqliteException ex) when (ex.SqliteErrorCode is SqliteNotADatabase or SqliteCorrupt)
            {
                return null;
            }
        }

        var header = new byte[SqliteHeaderLength];
        using (var stream = new FileStream(databasePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
        {
            if (stream.ReadAtLeast(header, header.Length, throwOnEndOfStream: false) < header.Length)
            {
                return null;
            }
        }

        if (!header.AsSpan(0, SqliteHeaderMagic.Length).SequenceEqual(SqliteHeaderMagic))
        {
            return null;
        }

        return BinaryPrimitives.ReadInt32BigEndian(header.AsSpan(SqliteUserVersionOffset, 4));
    }

    private static bool HasRequiredCatalogSchema(SqliteConnection connection)
    {
        return HasStrictSchema2(connection);
    }

    private static bool HasStrictSchema2(SqliteConnection connection)
    {
        if (ExecuteScalarInt(connection, "PRAGMA user_version;") != SchemaVersion)
        {
            return false;
        }

        if (!HasTables(connection, Schema2Tables) || HasTables(connection, ["available_tags"]))
        {
            return false;
        }

        return Schema2ItemColumns.All(column => HasItemColumn(connection, column));
    }

    private static LibraryCatalogSnapshot ReadSnapshot(SqliteConnection connection)
    {
        return new LibraryCatalogSnapshot
        {
            Sources = ReadSourceRows(connection),
            Items = ReadItemRows(connection),
            Categories = ReadCategoryRows(connection),
            Tags = ReadTagRows(connection)
        };
    }

    private static List<LibraryCatalogSource> ReadSourceRows(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, root_path, root_path_fold, display_name, is_enabled FROM sources ORDER BY position;";
        using var reader = command.ExecuteReader();
        var rows = new List<LibraryCatalogSource>();
        while (reader.Read())
        {
            rows.Add(new LibraryCatalogSource
            {
                Id = reader.GetString(0),
                RootPath = reader.GetString(1),
                RootPathFold = reader.GetString(2),
                DisplayName = reader.IsDBNull(3) ? null : reader.GetString(3),
                IsEnabled = reader.GetInt32(4) != 0
            });
        }

        return rows;
    }

    private static List<LibraryCatalogCategory> ReadCategoryRows(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, name, sort_order FROM categories ORDER BY position;";
        using var reader = command.ExecuteReader();
        var rows = new List<LibraryCatalogCategory>();
        while (reader.Read())
        {
            rows.Add(new LibraryCatalogCategory
            {
                Id = reader.GetString(0),
                Name = reader.GetString(1),
                SortOrder = reader.GetInt32(2)
            });
        }

        return rows;
    }

    private static List<LibraryCatalogTag> ReadTagRows(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT name, name_fold, category_id FROM tags ORDER BY position;";
        using var reader = command.ExecuteReader();
        var rows = new List<LibraryCatalogTag>();
        while (reader.Read())
        {
            rows.Add(new LibraryCatalogTag
            {
                Name = reader.GetString(0),
                NameFold = reader.GetString(1),
                CategoryId = reader.GetString(2)
            });
        }

        return rows;
    }

    private static List<LibraryCatalogItem> ReadItemRows(SqliteConnection connection)
    {
        var tagsByItem = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        using (var tagCommand = connection.CreateCommand())
        {
            tagCommand.CommandText = "SELECT item_id, name FROM item_tags ORDER BY item_id, position;";
            using var tagReader = tagCommand.ExecuteReader();
            while (tagReader.Read())
            {
                var itemId = tagReader.GetString(0);
                if (!tagsByItem.TryGetValue(itemId, out var names))
                {
                    names = [];
                    tagsByItem[itemId] = names;
                }

                names.Add(tagReader.GetString(1));
            }
        }

        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, source_id, full_path, full_path_fold, relative_path, relative_path_fold,
                   file_name, file_name_fold, duration_ticks, has_audio, integrated_loudness, peak_db,
                   is_favorite, is_blacklisted, play_count, last_played_utc, media_type, fingerprint,
                   fingerprint_algorithm, fingerprint_version, file_size_bytes, last_write_time_utc,
                   fingerprint_last_utc, fingerprint_status, loudness_error,
                   thumbnail_revision, thumbnail_width, thumbnail_height
            FROM items
            ORDER BY position;
            """;
        using var reader = command.ExecuteReader();
        var rows = new List<LibraryCatalogItem>();
        while (reader.Read())
        {
            var id = reader.GetString(0);
            rows.Add(new LibraryCatalogItem
            {
                Id = id,
                SourceId = reader.GetString(1),
                FullPath = reader.GetString(2),
                FullPathFold = reader.GetString(3),
                RelativePath = reader.GetString(4),
                RelativePathFold = reader.GetString(5),
                FileName = reader.GetString(6),
                FileNameFold = reader.GetString(7),
                DurationTicks = reader.IsDBNull(8) ? null : reader.GetInt64(8),
                HasAudio = reader.IsDBNull(9) ? null : reader.GetInt32(9) != 0,
                IntegratedLoudness = reader.IsDBNull(10) ? null : reader.GetDouble(10),
                PeakDb = reader.IsDBNull(11) ? null : reader.GetDouble(11),
                IsFavorite = reader.GetInt32(12) != 0,
                IsBlacklisted = reader.GetInt32(13) != 0,
                PlayCount = reader.GetInt32(14),
                LastPlayedUtc = ReadUtc(reader, 15),
                MediaType = reader.GetInt32(16),
                Fingerprint = reader.IsDBNull(17) ? null : reader.GetString(17),
                FingerprintAlgorithm = reader.GetString(18),
                FingerprintVersion = reader.GetInt32(19),
                FileSizeBytes = reader.IsDBNull(20) ? null : reader.GetInt64(20),
                LastWriteTimeUtc = ReadUtc(reader, 21),
                FingerprintLastUtc = ReadUtc(reader, 22),
                FingerprintStatus = reader.IsDBNull(23) ? null : reader.GetInt32(23),
                LoudnessError = reader.IsDBNull(24) ? null : reader.GetString(24),
                ThumbnailRevision = !reader.IsDBNull(25) ? reader.GetString(25) : null,
                ThumbnailWidth = !reader.IsDBNull(26) ? reader.GetInt32(26) : null,
                ThumbnailHeight = !reader.IsDBNull(27) ? reader.GetInt32(27) : null,
                Tags = tagsByItem.TryGetValue(id, out var names) ? names : []
            });
        }

        return rows;
    }

    internal static string NormalizeCategoryId(string? categoryId)
    {
        return string.IsNullOrWhiteSpace(categoryId) ? UncategorizedCategoryId : categoryId.Trim();
    }

    internal static DateTime? ReadUtc(SqliteDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        return new DateTime(reader.GetInt64(ordinal), DateTimeKind.Utc);
    }

    internal static string Fold(string value) => value.ToLowerInvariant();

    private static string ConnectionString(string databasePath, bool readOnly)
    {
        var builder = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWriteCreate,
            Pooling = false
        };
        return builder.ToString();
    }

    internal static SqliteConnection OpenWrite(string databasePath)
    {
        var connection = new SqliteConnection(ConnectionString(databasePath, readOnly: false));
        try
        {
            connection.Open();
            connection.DefaultTimeout = 1;
            Execute(connection, "PRAGMA journal_mode=WAL;");
            Execute(connection, "PRAGMA synchronous=NORMAL;");
            Execute(connection, "PRAGMA busy_timeout=1000;");
            return connection;
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    internal static int Execute(SqliteConnection connection, SqliteTransaction transaction, string sql, params (string Name, object Value)[] parameters)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value);
        }

        return command.ExecuteNonQuery();
    }

    private static SqliteConnection OpenReadOnly(string databasePath)
    {
        var connection = new SqliteConnection(ConnectionString(databasePath, readOnly: true));
        connection.Open();
        return connection;
    }

    private static void Execute(SqliteConnection connection, string sql, params (string Name, object Value)[] parameters)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value);
        }

        command.ExecuteNonQuery();
    }

    internal static int ExecuteScalarInt(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        var value = command.ExecuteScalar();
        return value is long number ? (int)number : Convert.ToInt32(value, CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// Finishes or rolls back a replace that stopped part way. When a newer build wrote one of the
    /// files, or a file it needs to judge could not be read to tell what it is, it changes nothing and
    /// says why. It judges each file with the same check as open, so a file open would refuse never
    /// takes the place of a usable one, and a damaged library.db it replaces is kept as a refused file.
    /// </summary>
    private static CatalogFilesCheck RecoverReplace(string directory)
    {
        var newer = CheckNewerCatalog(directory);
        if (newer != CatalogFilesCheck.Clear)
        {
            return newer;
        }

        var live = Path.Combine(directory, DatabaseFileName);
        var incoming = Path.Combine(directory, IncomingFileName);
        var previous = Path.Combine(directory, PreviousFileName);
        var liveState = CheckCatalogFile(live);
        if (liveState == CatalogFileState.Unreadable)
        {
            return CatalogFilesCheck.Unreadable;
        }

        if (liveState == CatalogFileState.Usable)
        {
            DeleteSidecars(incoming);
            DeleteSidecars(previous);
            return CatalogFilesCheck.Clear;
        }

        var previousState = CheckCatalogFile(previous);
        if (previousState == CatalogFileState.Unreadable)
        {
            return CatalogFilesCheck.Unreadable;
        }

        if (previousState == CatalogFileState.Usable)
        {
            // A damaged library.db is kept as a refused file, as open keeps one.
            if (liveState == CatalogFileState.Damaged)
            {
                Quarantine(live);
            }
            else
            {
                DeleteSidecars(live);
            }

            MoveDatabase(previous, live);
            DeleteSidecars(incoming);
            SyncDirectory(directory);
            return CatalogFilesCheck.Clear;
        }

        if (liveState == CatalogFileState.Missing)
        {
            var incomingState = CheckCatalogFile(incoming);
            if (incomingState == CatalogFileState.Unreadable)
            {
                return CatalogFilesCheck.Unreadable;
            }

            if (incomingState == CatalogFileState.Usable)
            {
                MoveDatabase(incoming, live);
                SyncDirectory(directory);
                return CatalogFilesCheck.Clear;
            }
        }

        DeleteSidecars(incoming);
        return CatalogFilesCheck.Clear;
    }

    private static bool IsHealthyFile(string databasePath)
    {
        return CheckCatalogFile(databasePath) == CatalogFileState.Usable;
    }

    private static void CheckpointStandalone(string databasePath)
    {
        using (var connection = new SqliteConnection(ConnectionString(databasePath, readOnly: false)))
        {
            connection.Open();
            connection.DefaultTimeout = 5;
            Execute(connection, "PRAGMA busy_timeout=5000;");
            Execute(connection, "PRAGMA wal_checkpoint(TRUNCATE);");
            Execute(connection, "PRAGMA journal_mode=DELETE;");
        }

        DeleteIfExists(databasePath + "-wal");
        DeleteIfExists(databasePath + "-shm");
        DeleteIfExists(databasePath + "-journal");
        SyncFile(databasePath);
    }

    private static void RestorePreviousOverLive(string directory)
    {
        var live = Path.Combine(directory, DatabaseFileName);
        var previous = Path.Combine(directory, PreviousFileName);
        if (!File.Exists(previous) && !Sidecars(previous).Any(File.Exists))
        {
            return;
        }

        DeleteSidecars(live);
        MoveDatabase(previous, live);
    }

    private static void MoveDatabase(string source, string destination)
    {
        if (File.Exists(destination) || Sidecars(destination).Any(File.Exists))
        {
            throw new IOException($"Cannot move '{source}' onto '{destination}'.");
        }

        if (File.Exists(source))
        {
            File.Move(source, destination);
        }

        foreach (var suffix in new[] { "-wal", "-shm", "-journal" })
        {
            var from = source + suffix;
            if (File.Exists(from))
            {
                File.Move(from, destination + suffix);
            }
        }
    }

    private static void Quarantine(string databasePath)
    {
        var directory = Path.GetDirectoryName(databasePath)!;
        var target = Path.Combine(directory, RefusedFileName);
        var suffix = 1;
        while (File.Exists(target) || Sidecars(target).Any(File.Exists))
        {
            target = Path.Combine(directory, RefusedFileName + "." + suffix);
            suffix++;
        }

        MoveIfExists(databasePath, target);
        foreach (var sidecar in Sidecars(databasePath))
        {
            MoveIfExists(sidecar, Path.Combine(directory, Path.GetFileName(target) + sidecar[databasePath.Length..]));
        }
    }

    private static void DeleteSidecars(string databasePath)
    {
        DeleteIfExists(databasePath);
        foreach (var sidecar in Sidecars(databasePath))
        {
            DeleteIfExists(sidecar);
        }
    }

    private static IEnumerable<string> Sidecars(string databasePath)
    {
        yield return databasePath + "-wal";
        yield return databasePath + "-shm";
        yield return databasePath + "-journal";
    }

    private static void MoveIfExists(string source, string destination)
    {
        if (File.Exists(source))
        {
            File.Move(source, destination);
        }
    }

    private static void DeleteIfExists(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    internal static void SyncFile(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite);
        stream.Flush(true);
    }

    private static void PublishDatabase(string tempPath, string databasePath)
    {
        if (OperatingSystem.IsWindows())
        {
            if (!MoveFileExW(tempPath, databasePath, WindowsPublishMoveFlags))
            {
                var error = Marshal.GetLastWin32Error();
                throw new IOException($"Could not publish '{databasePath}'. Error {error}.");
            }

            return;
        }

        File.Move(tempPath, databasePath);
    }

    private static void SyncDirectory(string directory)
    {
        if (OperatingSystem.IsWindows())
        {
            // The publish rename uses MOVEFILE_WRITE_THROUGH, so the new name is already on disk.
            return;
        }

        if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
        {
            SyncDirectoryUnix(directory);
            return;
        }

        throw new PlatformNotSupportedException($"Cannot sync '{directory}' on this operating system.");
    }

    private static void SyncDirectoryUnix(string directory)
    {
        var fd = open(directory, 0);
        if (fd < 0)
        {
            throw new IOException($"Could not open '{directory}' to sync it. Error {Marshal.GetLastWin32Error()}.");
        }

        try
        {
            if (fsync(fd) != 0)
            {
                var error = Marshal.GetLastWin32Error();
                throw new IOException($"Could not sync '{directory}'. Error {error}.");
            }
        }
        finally
        {
            _ = close(fd);
        }
    }

    [DllImport("kernel32.dll", EntryPoint = "MoveFileExW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool MoveFileExW(string lpExistingFileName, string lpNewFileName, uint dwFlags);

    [DllImport("libc", EntryPoint = "open", SetLastError = true)]
    private static extern int open(string pathname, int flags);

    [DllImport("libc", SetLastError = true)]
    private static extern int fsync(int fd);

    [DllImport("libc", SetLastError = true)]
    private static extern int close(int fd);

    private static bool HasTables(SqliteConnection connection, IReadOnlyList<string> required)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT name FROM sqlite_master WHERE type = 'table';";
        using var reader = command.ExecuteReader();
        var names = new HashSet<string>(StringComparer.Ordinal);
        while (reader.Read())
        {
            names.Add(reader.GetString(0));
        }

        return required.All(names.Contains);
    }

    private static bool HasItemColumn(SqliteConnection connection, string column)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM pragma_table_info('items') WHERE name = $name LIMIT 1;";
        command.Parameters.AddWithValue("$name", column);
        var value = command.ExecuteScalar();
        return value != null && value != DBNull.Value;
    }
}
