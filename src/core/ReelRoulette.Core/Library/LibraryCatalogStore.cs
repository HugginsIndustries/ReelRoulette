using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Storage;

namespace ReelRoulette.Core.Library;

public enum LibraryCatalogOpenStatus
{
    Opened,
    Refused,
    Absent
}

public sealed class LibraryCatalogOpenOptions
{
    public Action? BeforePublish { get; init; }

    public Action<string>? DirectorySync { get; init; }

    public string? ThumbnailDirectory { get; init; }

    public Action? AfterSideFileCopy { get; init; }
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
    public LibraryCatalogSnapshot? Catalog { get; init; }
    public LibraryCatalogSession? Session { get; init; }
    public bool MigratedSchema { get; init; }
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
    public IReadOnlyList<string> Tags { get; init; } = [];
}

public sealed class LibraryCatalogPreset
{
    public string Name { get; init; } = string.Empty;
    public string FilterStateJson { get; init; } = "{}";
}

public static partial class LibraryCatalogStore
{
    public const int SchemaVersion = 2;
    public const int PreviousSchemaVersion = 1;
    public const string DatabaseFileName = "library.db";
    public const string IncomingFileName = "library.db.incoming";
    public const string PreviousFileName = "library.db.previous";
    public const string LibraryFileName = "library.json";
    public const string MigratedLibraryFileName = "library.json.migrated";
    public const string PresetsFileName = "presets.json";
    public const string MigratedPresetsFileName = "presets.json.migrated";
    public const string ThumbnailIndexFileName = "index.json";
    public const string MigratedThumbnailIndexFileName = "index.json.migrated";
    public const string SideFilesCopiedKey = "side_files_copied";
    public const string ThumbnailDirectoryRequiredMessage =
        "A thumbnail directory is required to create a catalog.";

    public const string RefusedMessage =
        "The live database was refused.";

    public const string RefusedMessageWithSnapshot =
        "The live database was refused and the migration-time snapshot is still at library.json.migrated.";

    public const string RefusedMessageJsonPreserved =
        "The live database was refused. library.json was left in place.";

    public const string SnapshotAlreadyExistsMessage =
        "library.json was not migrated because library.json.migrated already exists.";

    internal const uint WindowsPublishMoveFlags = 0x8;

    private const int SqliteNotADatabase = 26;
    private const int SqliteCorrupt = 11;

    private const string MigratingFileName = "library.db.migrating";
    private const string RefusedFileName = "library.db.refused";
    internal const string UncategorizedCategoryId = "uncategorized";
    internal const string UncategorizedCategoryName = "Uncategorized";

    private static readonly string[] Schema1Tables =
    [
        "sources",
        "items",
        "categories",
        "tags",
        "item_tags",
        "available_tags",
        "catalog_meta"
    ];

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

    public static LibraryCatalogOpenResult Open(string directory, LibraryCatalogOpenOptions? options = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        Directory.CreateDirectory(directory);
        RecoverReplace(directory);

        var databasePath = Path.Combine(directory, DatabaseFileName);
        var libraryPath = Path.Combine(directory, LibraryFileName);
        var migratedPath = Path.Combine(directory, MigratedLibraryFileName);

        if (File.Exists(databasePath))
        {
            try
            {
                var migration = TryMigrateSchema(directory, databasePath, options);
                if (IsHealthy(databasePath))
                {
                    FinishSideFileCopy(directory, databasePath, options, migration != SchemaMigration.None);
                    return Opened(databasePath, migration == SchemaMigration.Schema1);
                }
            }
            catch (SqliteException ex) when (ex.SqliteErrorCode is SqliteNotADatabase or SqliteCorrupt)
            {
                // The header check passed, and a later row read found a corrupt or non-database file.
            }

            Quarantine(databasePath);
            if (File.Exists(libraryPath))
            {
                return Refused(RefusedMessageJsonPreserved);
            }

            return Refused(File.Exists(migratedPath) ? RefusedMessageWithSnapshot : RefusedMessage);
        }

        if (string.IsNullOrWhiteSpace(options?.ThumbnailDirectory))
        {
            throw new InvalidOperationException(ThumbnailDirectoryRequiredMessage);
        }

        if (File.Exists(libraryPath))
        {
            Migrate(directory, libraryPath, databasePath, options);
            FinishSideFileCopy(directory, databasePath, options, copiedThisOpen: true);
            return Opened(databasePath);
        }

        if (File.Exists(migratedPath))
        {
            return Refused(RefusedMessageWithSnapshot);
        }

        CreateEmpty(directory, databasePath, options.ThumbnailDirectory);
        FinishSideFileCopy(directory, databasePath, options, copiedThisOpen: true);
        return Opened(databasePath);
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

    public static bool IsUsableDatabase(string databasePath)
    {
        return IsHealthyFile(databasePath);
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

    public static bool DatabaseHasContent(string databasePath)
    {
        return ReadDatabaseContent(databasePath) == DatabaseContentRead.HasContent;
    }

    public static void PrepareIncomingFromFile(string directory, string checkpointPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        ArgumentException.ThrowIfNullOrWhiteSpace(checkpointPath);
        Directory.CreateDirectory(directory);
        RecoverReplace(directory);
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
        SyncDirectory(directory, options: null);
    }

    public static void PrepareIncomingFromJson(string directory, JsonObject root)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        ArgumentNullException.ThrowIfNull(root);
        Directory.CreateDirectory(directory);
        RecoverReplace(directory);
        var incoming = Path.Combine(directory, IncomingFileName);
        DeleteSidecars(incoming);
        WriteDatabase(incoming, root, catalogDirectory: null, thumbnailDirectory: null, copySideFiles: false);
        if (!IsHealthyFile(incoming))
        {
            DeleteSidecars(incoming);
            throw new InvalidDataException("Incoming catalog is not a usable database.");
        }
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
            SyncDirectory(directory, options: null);
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
            SyncDirectory(directory, options: null);
        }

        return true;
    }

    public static void DeleteLiveDatabase(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        DeleteSidecars(Path.Combine(directory, DatabaseFileName));
        if (Directory.Exists(directory))
        {
            SyncDirectory(directory, options: null);
        }
    }

    public static void PublishIncoming(string directory, LibraryCatalogReplaceOptions? options = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        Directory.CreateDirectory(directory);
        var live = Path.Combine(directory, DatabaseFileName);
        var incoming = Path.Combine(directory, IncomingFileName);
        var previous = Path.Combine(directory, PreviousFileName);
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
            SyncDirectory(directory, options: null);
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
        SyncDirectory(directory, options: null);
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

    private static LibraryCatalogOpenResult Opened(string databasePath, bool migratedSchema = false)
    {
        return new LibraryCatalogOpenResult
        {
            Status = LibraryCatalogOpenStatus.Opened,
            Catalog = Read(databasePath),
            Session = new LibraryCatalogSession(databasePath),
            MigratedSchema = migratedSchema
        };
    }

    private static LibraryCatalogOpenResult Refused(string message)
    {
        return new LibraryCatalogOpenResult
        {
            Status = LibraryCatalogOpenStatus.Refused,
            Message = message
        };
    }

    private static void CreateEmpty(string directory, string databasePath, string thumbnailDirectory)
    {
        var tempPath = Path.Combine(directory, MigratingFileName);
        DeleteSidecars(tempPath);
        var published = false;
        try
        {
            WriteDatabase(tempPath, new JsonObject(), directory, thumbnailDirectory, copySideFiles: true);
            SyncFile(tempPath);
            PublishDatabase(tempPath, databasePath);
            published = true;
            SyncDirectory(directory, options: null);
        }
        finally
        {
            if (!published)
            {
                DeleteSidecars(tempPath);
            }
        }
    }

    private static void Migrate(string directory, string libraryPath, string databasePath, LibraryCatalogOpenOptions? options)
    {
        var migratedPath = Path.Combine(directory, MigratedLibraryFileName);
        if (File.Exists(migratedPath))
        {
            throw new InvalidOperationException(SnapshotAlreadyExistsMessage);
        }

        var tempPath = Path.Combine(directory, MigratingFileName);
        DeleteSidecars(tempPath);

        var published = false;
        try
        {
            var root = JsonNode.Parse(File.ReadAllText(libraryPath)) as JsonObject
                ?? throw new InvalidDataException("library.json is not an object.");
            WriteDatabase(tempPath, root, directory, options?.ThumbnailDirectory, copySideFiles: true);
            SyncFile(tempPath);
            options?.BeforePublish?.Invoke();
            if (File.Exists(migratedPath))
            {
                throw new InvalidOperationException(SnapshotAlreadyExistsMessage);
            }

            PublishDatabase(tempPath, databasePath);
            published = true;
            SyncDirectory(directory, options);
            File.Move(libraryPath, migratedPath);
        }
        finally
        {
            if (!published)
            {
                DeleteSidecars(tempPath);
            }
        }
    }

    private static void WriteDatabase(
        string tempPath,
        JsonObject root,
        string? catalogDirectory,
        string? thumbnailDirectory,
        bool copySideFiles)
    {
        var sources = ReadSources(root);
        var categories = ReadCategories(root);
        var tags = ReadTags(root);
        var items = ReadItems(root);

        var seenIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in items)
        {
            if (!seenIds.Add(item.Id))
            {
                throw new InvalidDataException($"Duplicate item id '{item.Id}'.");
            }
        }

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

        InsertSources(connection, sources);
        InsertCategories(connection, categories);
        InsertTags(connection, tags);
        InsertItems(connection, items);
        Execute(connection, transaction, "INSERT INTO catalog_meta (key, value) VALUES ('revision', '0');");
        if (copySideFiles)
        {
            CopySideFiles(connection, transaction, catalogDirectory!, thumbnailDirectory!);
        }

        Execute(connection, transaction, $"PRAGMA user_version = {SchemaVersion};");
        transaction.Commit();
        Execute(connection, "PRAGMA wal_checkpoint(TRUNCATE);");
        connection.Close();
        DeleteIfExists(tempPath + "-wal");
        DeleteIfExists(tempPath + "-shm");
    }

    private static bool IsHealthy(string databasePath)
    {
        try
        {
            using var connection = OpenReadOnly(databasePath);
            // This provider treats a timeout of 0 as wait-forever. One second is its shortest finite busy wait.
            connection.DefaultTimeout = 1;
            return HasRequiredCatalogSchema(connection);
        }
        catch (SqliteException ex) when (ex.SqliteErrorCode is SqliteNotADatabase or SqliteCorrupt)
        {
            return false;
        }
    }

    public enum CatalogFileInspection
    {
        Usable,
        NotADatabase,
        Unavailable
    }

    public static CatalogFileInspection InspectCatalogFile(string databasePath)
    {
        if (!File.Exists(databasePath))
        {
            return CatalogFileInspection.Unavailable;
        }

        try
        {
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

    private static bool HasRequiredCatalogSchema(SqliteConnection connection)
    {
        var version = ExecuteScalarInt(connection, "PRAGMA user_version;");
        if (version == PreviousSchemaVersion)
        {
            return HasTables(connection, Schema1Tables) && HasItemColumn(connection, "loudness_error");
        }

        if (version == SchemaVersion)
        {
            return HasStrictSchema2(connection);
        }

        return false;
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

        var includeThumbnails = HasItemColumn(connection, "thumbnail_revision");
        using var command = connection.CreateCommand();
        command.CommandText = includeThumbnails
            ? """
            SELECT id, source_id, full_path, full_path_fold, relative_path, relative_path_fold,
                   file_name, file_name_fold, duration_ticks, has_audio, integrated_loudness, peak_db,
                   is_favorite, is_blacklisted, play_count, last_played_utc, media_type, fingerprint,
                   fingerprint_algorithm, fingerprint_version, file_size_bytes, last_write_time_utc,
                   fingerprint_last_utc, fingerprint_status, loudness_error,
                   thumbnail_revision, thumbnail_width, thumbnail_height
            FROM items
            ORDER BY position;
            """
            : """
            SELECT id, source_id, full_path, full_path_fold, relative_path, relative_path_fold,
                   file_name, file_name_fold, duration_ticks, has_audio, integrated_loudness, peak_db,
                   is_favorite, is_blacklisted, play_count, last_played_utc, media_type, fingerprint,
                   fingerprint_algorithm, fingerprint_version, file_size_bytes, last_write_time_utc,
                   fingerprint_last_utc, fingerprint_status, loudness_error
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
                ThumbnailRevision = includeThumbnails && !reader.IsDBNull(25) ? reader.GetString(25) : null,
                ThumbnailWidth = includeThumbnails && !reader.IsDBNull(26) ? reader.GetInt32(26) : null,
                ThumbnailHeight = includeThumbnails && !reader.IsDBNull(27) ? reader.GetInt32(27) : null,
                Tags = tagsByItem.TryGetValue(id, out var names) ? names : []
            });
        }

        return rows;
    }

    private static void InsertSources(SqliteConnection connection, IReadOnlyList<SourceRow> sources)
    {
        for (var i = 0; i < sources.Count; i++)
        {
            var source = sources[i];
            Execute(
                connection,
                """
                INSERT INTO sources (id, position, root_path, root_path_fold, display_name, is_enabled)
                VALUES ($id, $position, $root, $fold, $display, $enabled);
                """,
                ("$id", source.Id),
                ("$position", i),
                ("$root", source.RootPath),
                ("$fold", Fold(source.RootPath)),
                ("$display", (object?)source.DisplayName ?? DBNull.Value),
                ("$enabled", source.IsEnabled ? 1 : 0));
        }
    }

    private static void InsertCategories(SqliteConnection connection, IReadOnlyList<CategoryRow> categories)
    {
        for (var i = 0; i < categories.Count; i++)
        {
            var category = categories[i];
            Execute(
                connection,
                """
                INSERT INTO categories (id, position, name, sort_order)
                VALUES ($id, $position, $name, $sort);
                """,
                ("$id", category.Id),
                ("$position", i),
                ("$name", category.Name),
                ("$sort", category.SortOrder));
        }
    }

    private static void InsertTags(SqliteConnection connection, IReadOnlyList<TagRow> tags)
    {
        for (var i = 0; i < tags.Count; i++)
        {
            var tag = tags[i];
            Execute(
                connection,
                """
                INSERT INTO tags (position, name, name_fold, category_id)
                VALUES ($position, $name, $fold, $category);
                """,
                ("$position", i),
                ("$name", tag.Name),
                ("$fold", Fold(tag.Name)),
                ("$category", tag.CategoryId));
        }
    }

    private static void InsertItems(SqliteConnection connection, IReadOnlyList<ItemRow> items)
    {
        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
            Execute(
                connection,
                """
                INSERT INTO items (
                    id, position, source_id, full_path, full_path_fold, relative_path, relative_path_fold,
                    file_name, file_name_fold, duration_ticks, has_audio, integrated_loudness, peak_db,
                    is_favorite, is_blacklisted, play_count, last_played_utc, media_type, fingerprint,
                    fingerprint_algorithm, fingerprint_version, file_size_bytes, last_write_time_utc,
                    fingerprint_last_utc, fingerprint_status, loudness_error)
                VALUES (
                    $id, $position, $source, $full, $fullFold, $relative, $relativeFold,
                    $file, $fileFold, $duration, $audio, $loudness, $peak,
                    $favorite, $blacklisted, $plays, $played, $media, $fingerprint,
                    $algorithm, $fpVersion, $size, $write, $fpLast, $fpStatus, $loudnessError);
                """,
                ("$id", item.Id),
                ("$position", i),
                ("$source", item.SourceId),
                ("$full", item.FullPath),
                ("$fullFold", Fold(item.FullPath)),
                ("$relative", item.RelativePath),
                ("$relativeFold", Fold(item.RelativePath)),
                ("$file", item.FileName),
                ("$fileFold", Fold(item.FileName)),
                ("$duration", (object?)item.DurationTicks ?? DBNull.Value),
                ("$audio", item.HasAudio switch { true => 1, false => 0, _ => DBNull.Value }),
                ("$loudness", (object?)item.IntegratedLoudness ?? DBNull.Value),
                ("$peak", (object?)item.PeakDb ?? DBNull.Value),
                ("$favorite", item.IsFavorite ? 1 : 0),
                ("$blacklisted", item.IsBlacklisted ? 1 : 0),
                ("$plays", item.PlayCount),
                ("$played", (object?)item.LastPlayedUtcTicks ?? DBNull.Value),
                ("$media", item.MediaType),
                ("$fingerprint", (object?)item.Fingerprint ?? DBNull.Value),
                ("$algorithm", item.FingerprintAlgorithm),
                ("$fpVersion", item.FingerprintVersion),
                ("$size", (object?)item.FileSizeBytes ?? DBNull.Value),
                ("$write", (object?)item.LastWriteTimeUtcTicks ?? DBNull.Value),
                ("$fpLast", (object?)item.FingerprintLastUtcTicks ?? DBNull.Value),
                ("$fpStatus", (object?)item.FingerprintStatus ?? DBNull.Value),
                ("$loudnessError", (object?)item.LoudnessError ?? DBNull.Value));

            for (var tagIndex = 0; tagIndex < item.Tags.Count; tagIndex++)
            {
                var name = item.Tags[tagIndex];
                Execute(
                    connection,
                    """
                    INSERT INTO item_tags (item_id, position, name, name_fold)
                    VALUES ($item, $position, $name, $fold);
                    """,
                    ("$item", item.Id),
                    ("$position", tagIndex),
                    ("$name", name),
                    ("$fold", Fold(name)));
            }
        }
    }

    private static List<SourceRow> ReadSources(JsonObject root)
    {
        var rows = new List<SourceRow>();
        if (root["sources"] is not JsonArray sources)
        {
            return rows;
        }

        foreach (var node in sources.OfType<JsonObject>())
        {
            var rootPath = GetNodeString(node["rootPath"]);
            var id = GetNodeString(node["id"]);
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(rootPath))
            {
                continue;
            }

            var display = node["displayName"] is null ? null : GetNodeString(node["displayName"]);
            rows.Add(new SourceRow(id, rootPath, string.IsNullOrEmpty(display) ? null : display, GetNodeBool(node["isEnabled"], true)));
        }

        return rows;
    }

    private static List<CategoryRow> ReadCategories(JsonObject root)
    {
        var rows = new List<CategoryRow>();
        if (root["categories"] is JsonArray categories)
        {
            var position = 0;
            var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var node in categories.OfType<JsonObject>())
            {
                var name = GetNodeString(node["name"]);
                if (string.IsNullOrWhiteSpace(name))
                {
                    continue;
                }

                var id = NormalizeCategoryId(GetNodeString(node["id"]));
                if (!seenIds.Add(id))
                {
                    continue;
                }

                rows.Add(new CategoryRow(id, name, GetNodeInt(node["sortOrder"], position)));
                position++;
            }
        }

        var existing = rows.FindIndex(row => string.Equals(row.Id, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase));
        if (existing < 0)
        {
            rows.Add(new CategoryRow(UncategorizedCategoryId, UncategorizedCategoryName, int.MaxValue));
        }
        else
        {
            rows[existing] = rows[existing] with
            {
                Id = UncategorizedCategoryId,
                Name = UncategorizedCategoryName,
                SortOrder = int.MaxValue
            };
        }

        return rows;
    }

    private static List<TagRow> ReadTags(JsonObject root)
    {
        var rows = new List<TagRow>();
        if (root["tags"] is not JsonArray tags)
        {
            return rows;
        }

        foreach (var node in tags.OfType<JsonObject>())
        {
            var name = GetNodeString(node["name"]);
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            rows.RemoveAll(tag => string.Equals(tag.Name, name, StringComparison.OrdinalIgnoreCase));
            rows.Add(new TagRow(name, NormalizeCategoryId(GetNodeString(node["categoryId"]))));
        }

        return rows;
    }

    private static List<ItemRow> ReadItems(JsonObject root)
    {
        var rows = new List<ItemRow>();
        if (root["items"] is not JsonArray items)
        {
            return rows;
        }

        foreach (var node in items.OfType<JsonObject>())
        {
            var fullPath = GetNodeString(node["fullPath"]);
            if (string.IsNullOrWhiteSpace(fullPath))
            {
                continue;
            }

            var id = GetNodeString(node["id"]);
            if (string.IsNullOrWhiteSpace(id))
            {
                id = fullPath;
            }

            var fileName = GetNodeString(node["fileName"]);
            if (string.IsNullOrWhiteSpace(fileName))
            {
                fileName = Path.GetFileName(fullPath);
            }

            var tags = node["tags"] is JsonArray tagArray
                ? tagArray.Select(GetNodeString).Where(name => !string.IsNullOrWhiteSpace(name)).ToList()
                : [];

            rows.Add(new ItemRow(
                id,
                GetNodeString(node["sourceId"]),
                fullPath,
                GetNodeString(node["relativePath"]),
                fileName,
                TryGetNodeTimeSpan(node["duration"])?.Ticks,
                GetNodeNullableBool(node["hasAudio"]),
                GetNodeNullableDouble(node["integratedLoudness"]),
                GetNodeNullableDouble(node["peakDb"]),
                NullIfEmpty(GetNodeString(node["loudnessError"])),
                GetNodeBool(node["isFavorite"], false),
                GetNodeBool(node["isBlacklisted"], false),
                GetNodeInt(node["playCount"], 0),
                ParseUtc(node["lastPlayedUtc"])?.Ticks,
                ResolveMediaType(node["mediaType"]),
                NullIfEmpty(GetNodeString(node["fingerprint"])),
                string.IsNullOrWhiteSpace(GetNodeString(node["fingerprintAlgorithm"])) ? "SHA-256" : GetNodeString(node["fingerprintAlgorithm"]),
                GetNodeInt(node["fingerprintVersion"], 1),
                GetNodeNullableLong(node["fileSizeBytes"]),
                ParseUtc(node["lastWriteTimeUtc"])?.Ticks,
                ParseUtc(node["fingerprintLastUtc"])?.Ticks,
                ResolveFingerprintStatus(node["fingerprintStatus"]),
                tags));
        }

        return rows;
    }

    private static int ResolveMediaType(JsonNode? node)
    {
        if (node is null)
        {
            return 0;
        }

        if (node is JsonValue value && value.TryGetValue<int>(out var intValue))
        {
            return intValue;
        }

        if (node is JsonValue textValue && textValue.TryGetValue<string>(out var text))
        {
            var trimmed = (text ?? string.Empty).Trim();
            return trimmed.Equals("Video", StringComparison.OrdinalIgnoreCase) ? 0 :
                trimmed.Equals("Photo", StringComparison.OrdinalIgnoreCase) ? 1 :
                0;
        }

        return 0;
    }

    internal static string NormalizeCategoryId(string? categoryId)
    {
        return string.IsNullOrWhiteSpace(categoryId) ? UncategorizedCategoryId : categoryId.Trim();
    }

    private static int? ResolveFingerprintStatus(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        if (node is JsonValue value && value.TryGetValue<int>(out var intValue))
        {
            return intValue;
        }

        if (node is JsonValue textValue && textValue.TryGetValue<string>(out var text))
        {
            var trimmed = (text ?? string.Empty).Trim();
            return trimmed.Equals("Pending", StringComparison.OrdinalIgnoreCase) ? 0 :
                trimmed.Equals("Ready", StringComparison.OrdinalIgnoreCase) ? 1 :
                trimmed.Equals("Failed", StringComparison.OrdinalIgnoreCase) ? 2 :
                trimmed.Equals("Stale", StringComparison.OrdinalIgnoreCase) ? 3 :
                0;
        }

        return 0;
    }

    private static TimeSpan? TryGetNodeTimeSpan(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        try
        {
            if (node is JsonValue value)
            {
                if (value.TryGetValue<TimeSpan>(out var timeSpan))
                {
                    return timeSpan;
                }

                if (value.TryGetValue<double>(out var seconds))
                {
                    return TimeSpan.FromSeconds(Math.Max(0, seconds));
                }
            }
        }
        catch
        {
            // Fall through to string parsing.
        }

        var text = GetNodeString(node);
        if (TimeSpan.TryParse(text, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsedSeconds))
        {
            return TimeSpan.FromSeconds(Math.Max(0, parsedSeconds));
        }

        return null;
    }

    private static string GetNodeString(JsonNode? node)
    {
        if (node is null)
        {
            return string.Empty;
        }

        try
        {
            return node.GetValue<string>()?.Trim() ?? string.Empty;
        }
        catch
        {
            var raw = node.ToJsonString().Trim();
            if (raw.Length >= 2 && raw[0] == '"' && raw[^1] == '"')
            {
                raw = raw[1..^1];
            }

            return raw;
        }
    }

    private static bool GetNodeBool(JsonNode? node, bool defaultValue)
    {
        if (node is null)
        {
            return defaultValue;
        }

        try
        {
            return node.GetValue<bool>();
        }
        catch
        {
            var text = GetNodeString(node);
            if (bool.TryParse(text, out var parsed))
            {
                return parsed;
            }

            if (int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var numeric))
            {
                return numeric != 0;
            }

            return defaultValue;
        }
    }

    private static bool? GetNodeNullableBool(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        return GetNodeBool(node, false);
    }

    private static int GetNodeInt(JsonNode? node, int defaultValue)
    {
        if (node is null)
        {
            return defaultValue;
        }

        try
        {
            return node.GetValue<int>();
        }
        catch
        {
            var text = GetNodeString(node);
            if (int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedInt))
            {
                return parsedInt;
            }

            return defaultValue;
        }
    }

    private static double? GetNodeNullableDouble(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        try
        {
            return node.GetValue<double>();
        }
        catch
        {
            var text = GetNodeString(node);
            return double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
        }
    }

    private static long? GetNodeNullableLong(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        try
        {
            return node.GetValue<long>();
        }
        catch
        {
            var text = GetNodeString(node);
            return long.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
        }
    }

    private static DateTime? ParseUtc(JsonNode? node)
    {
        if (node is not JsonValue value || !value.TryGetValue<string>(out var text) || string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        if (!DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
        {
            return null;
        }

        return parsed.Kind switch
        {
            DateTimeKind.Utc => parsed,
            DateTimeKind.Local => parsed.ToUniversalTime(),
            _ => DateTime.SpecifyKind(parsed, DateTimeKind.Utc)
        };
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

    private static string? NullIfEmpty(string value) => string.IsNullOrWhiteSpace(value) ? null : value;

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
        connection.Open();
        connection.DefaultTimeout = 1;
        Execute(connection, "PRAGMA journal_mode=WAL;");
        Execute(connection, "PRAGMA synchronous=NORMAL;");
        Execute(connection, "PRAGMA busy_timeout=1000;");
        return connection;
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

    private static string ExecuteScalarString(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return command.ExecuteScalar() as string ?? string.Empty;
    }

    private static void RecoverReplace(string directory)
    {
        var live = Path.Combine(directory, DatabaseFileName);
        var incoming = Path.Combine(directory, IncomingFileName);
        var previous = Path.Combine(directory, PreviousFileName);
        if (IsHealthyFile(live))
        {
            DeleteSidecars(incoming);
            DeleteSidecars(previous);
            return;
        }

        if (IsHealthyFile(previous))
        {
            DeleteSidecars(live);
            MoveDatabase(previous, live);
            DeleteSidecars(incoming);
            SyncDirectory(directory, options: null);
            return;
        }

        if (!File.Exists(live) && IsHealthyFile(incoming))
        {
            MoveDatabase(incoming, live);
            SyncDirectory(directory, options: null);
            return;
        }

        DeleteSidecars(incoming);
    }

    private static bool IsHealthyFile(string databasePath)
    {
        if (!File.Exists(databasePath))
        {
            return false;
        }

        try
        {
            return IsHealthy(databasePath);
        }
        catch (Exception ex) when (ex is SqliteException or IOException or InvalidDataException)
        {
            return false;
        }
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

    private static void SyncDirectory(string directory, LibraryCatalogOpenOptions? options)
    {
        if (options?.DirectorySync != null)
        {
            options.DirectorySync(directory);
            return;
        }

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

    private sealed record SourceRow(string Id, string RootPath, string? DisplayName, bool IsEnabled);
    private sealed record CategoryRow(string Id, string Name, int SortOrder);
    private sealed record TagRow(string Name, string CategoryId);
    private sealed record ItemRow(
        string Id,
        string SourceId,
        string FullPath,
        string RelativePath,
        string FileName,
        long? DurationTicks,
        bool? HasAudio,
        double? IntegratedLoudness,
        double? PeakDb,
        string? LoudnessError,
        bool IsFavorite,
        bool IsBlacklisted,
        int PlayCount,
        long? LastPlayedUtcTicks,
        int MediaType,
        string? Fingerprint,
        string FingerprintAlgorithm,
        int FingerprintVersion,
        long? FileSizeBytes,
        long? LastWriteTimeUtcTicks,
        long? FingerprintLastUtcTicks,
        int? FingerprintStatus,
        IReadOnlyList<string> Tags);
}
