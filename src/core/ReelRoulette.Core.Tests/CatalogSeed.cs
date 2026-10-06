using Microsoft.Data.Sqlite;

namespace ReelRoulette.Core.Tests;

internal sealed record SeedSource(string Id, string RootPath, string? DisplayName = null, bool IsEnabled = true);

internal sealed record SeedCategory(string Id, string Name, int SortOrder);

internal sealed record SeedTag(string Name, string CategoryId = "uncategorized");

internal sealed record SeedPreset(string Name, string FilterStateJson = "{}");

internal sealed record SeedItem(string Id, string FullPath)
{
    public string SourceId { get; init; } = string.Empty;
    public string RelativePath { get; init; } = string.Empty;
    public string? FileName { get; init; }
    public TimeSpan? Duration { get; init; }
    public bool? HasAudio { get; init; }
    public double? IntegratedLoudness { get; init; }
    public double? PeakDb { get; init; }
    public string? LoudnessError { get; init; }
    public bool IsFavorite { get; init; }
    public bool IsBlacklisted { get; init; }
    public int PlayCount { get; init; }
    public DateTime? LastPlayedUtc { get; init; }

    /// <summary>0 is video, 1 is photo.</summary>
    public int MediaType { get; init; }

    public string? Fingerprint { get; init; }
    public string FingerprintAlgorithm { get; init; } = "SHA-256";
    public int FingerprintVersion { get; init; } = 1;
    public long? FileSizeBytes { get; init; }
    public DateTime? LastWriteTimeUtc { get; init; }
    public DateTime? FingerprintLastUtc { get; init; }

    /// <summary>0 pending, 1 ready, 2 failed, 3 stale.</summary>
    public int? FingerprintStatus { get; init; }

    public string? ThumbnailRevision { get; init; }
    public int? ThumbnailWidth { get; init; }
    public int? ThumbnailHeight { get; init; }
    public IReadOnlyList<string> Tags { get; init; } = [];
}

/// <summary>
/// Writes a schema version 2 <c>library.db</c> with SQL so tests start from a known catalog.
/// A test checks that its schema (tables, columns with types, indexes, and user version) matches a catalog the store creates.
/// </summary>
internal static class CatalogSeed
{
    public const string UncategorizedCategoryId = "uncategorized";

    /// <summary>
    /// Creates <c>library.db</c> in <paramref name="directory"/>. It must not exist yet.
    /// An Uncategorized category is added when <paramref name="categories"/> has none, as in every catalog.
    /// </summary>
    public static void Write(
        string directory,
        IEnumerable<SeedSource>? sources = null,
        IEnumerable<SeedItem>? items = null,
        IEnumerable<SeedCategory>? categories = null,
        IEnumerable<SeedTag>? tags = null,
        IEnumerable<SeedPreset>? presets = null)
    {
        Directory.CreateDirectory(directory);
        var databasePath = Path.Combine(directory, "library.db");
        if (File.Exists(databasePath))
        {
            throw new InvalidOperationException($"{databasePath} already exists.");
        }

        var categoryRows = (categories ?? []).ToList();
        if (!categoryRows.Any(category => category.Id == UncategorizedCategoryId))
        {
            categoryRows.Add(new SeedCategory(UncategorizedCategoryId, "Uncategorized", int.MaxValue));
        }

        using (var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Pooling = false
        }.ToString()))
        {
            connection.Open();
            Execute(connection, "PRAGMA journal_mode=WAL;");
            Execute(connection, "BEGIN;");
            Execute(connection, Schema);

            foreach (var (source, position) in (sources ?? []).Select((row, index) => (row, index)))
            {
                Execute(
                    connection,
                    "INSERT INTO sources VALUES ($id, $position, $root, $rootFold, $display, $enabled);",
                    ("$id", source.Id),
                    ("$position", position),
                    ("$root", source.RootPath),
                    ("$rootFold", Fold(source.RootPath)),
                    ("$display", source.DisplayName),
                    ("$enabled", source.IsEnabled ? 1 : 0));
            }

            foreach (var (category, position) in categoryRows.Select((row, index) => (row, index)))
            {
                Execute(
                    connection,
                    "INSERT INTO categories VALUES ($id, $position, $name, $sort);",
                    ("$id", category.Id),
                    ("$position", position),
                    ("$name", category.Name),
                    ("$sort", category.SortOrder));
            }

            foreach (var (tag, position) in (tags ?? []).Select((row, index) => (row, index)))
            {
                Execute(
                    connection,
                    "INSERT INTO tags VALUES ($position, $name, $fold, $category);",
                    ("$position", position),
                    ("$name", tag.Name),
                    ("$fold", Fold(tag.Name)),
                    ("$category", tag.CategoryId));
            }

            foreach (var (item, position) in (items ?? []).Select((row, index) => (row, index)))
            {
                var fileName = item.FileName ?? Path.GetFileName(item.FullPath);
                Execute(
                    connection,
                    """
                    INSERT INTO items VALUES (
                        $id, $position, $source, $full, $fullFold, $relative, $relativeFold,
                        $file, $fileFold, $duration, $audio, $loudness, $peak,
                        $favorite, $blacklisted, $plays, $played, $media, $fingerprint,
                        $algorithm, $fpVersion, $size, $write, $fpLast, $fpStatus, $loudnessError,
                        $thumbRevision, $thumbWidth, $thumbHeight);
                    """,
                    ("$id", item.Id),
                    ("$position", position),
                    ("$source", item.SourceId),
                    ("$full", item.FullPath),
                    ("$fullFold", Fold(item.FullPath)),
                    ("$relative", item.RelativePath),
                    ("$relativeFold", Fold(item.RelativePath)),
                    ("$file", fileName),
                    ("$fileFold", Fold(fileName)),
                    ("$duration", item.Duration?.Ticks),
                    ("$audio", item.HasAudio switch { true => 1, false => 0, _ => null }),
                    ("$loudness", item.IntegratedLoudness),
                    ("$peak", item.PeakDb),
                    ("$favorite", item.IsFavorite ? 1 : 0),
                    ("$blacklisted", item.IsBlacklisted ? 1 : 0),
                    ("$plays", item.PlayCount),
                    ("$played", item.LastPlayedUtc?.ToUniversalTime().Ticks),
                    ("$media", item.MediaType),
                    ("$fingerprint", item.Fingerprint),
                    ("$algorithm", item.FingerprintAlgorithm),
                    ("$fpVersion", item.FingerprintVersion),
                    ("$size", item.FileSizeBytes),
                    ("$write", item.LastWriteTimeUtc?.ToUniversalTime().Ticks),
                    ("$fpLast", item.FingerprintLastUtc?.ToUniversalTime().Ticks),
                    ("$fpStatus", item.FingerprintStatus),
                    ("$loudnessError", item.LoudnessError),
                    ("$thumbRevision", item.ThumbnailRevision),
                    ("$thumbWidth", item.ThumbnailWidth),
                    ("$thumbHeight", item.ThumbnailHeight));

                foreach (var (name, tagPosition) in item.Tags.Select((row, index) => (row, index)))
                {
                    Execute(
                        connection,
                        "INSERT INTO item_tags VALUES ($item, $position, $name, $fold);",
                        ("$item", item.Id),
                        ("$position", tagPosition),
                        ("$name", name),
                        ("$fold", Fold(name)));
                }
            }

            foreach (var (preset, position) in (presets ?? []).Select((row, index) => (row, index)))
            {
                Execute(
                    connection,
                    "INSERT INTO presets VALUES ($position, $name, $fold, $filter);",
                    ("$position", position),
                    ("$name", preset.Name),
                    ("$fold", Fold(preset.Name)),
                    ("$filter", preset.FilterStateJson));
            }

            Execute(connection, "INSERT INTO catalog_meta VALUES ('revision', '0');");

            Execute(connection, "PRAGMA user_version = 2;");
            Execute(connection, "COMMIT;");
            Execute(connection, "PRAGMA wal_checkpoint(TRUNCATE);");
        }
    }

    /// <summary>
    /// Writes a catalog as <paramref name="fileName"/> in <paramref name="directory"/> and stamps it with
    /// <paramref name="userVersion"/>. Above schema version 2 it also gains one <c>items</c> column, as a
    /// later schema would. The file is closed cleanly, so no sidecar files remain. A live catalog is in
    /// WAL mode; <paramref name="standalone"/> writes it in rollback-journal mode, as backups and replace files are.
    /// </summary>
    public static string WriteAtVersion(
        string directory,
        int userVersion,
        string fileName = "library.db",
        IEnumerable<SeedItem>? items = null,
        bool standalone = false)
    {
        Directory.CreateDirectory(directory);
        var staging = Path.Combine(Path.GetTempPath(), "rr-seed-" + Guid.NewGuid().ToString("N"));
        try
        {
            Write(staging, items: items);
            var staged = Path.Combine(staging, "library.db");
            using (var connection = new SqliteConnection(new SqliteConnectionStringBuilder
            {
                DataSource = staged,
                Mode = SqliteOpenMode.ReadWrite,
                Pooling = false
            }.ToString()))
            {
                connection.Open();
                if (userVersion > 2)
                {
                    Execute(connection, "ALTER TABLE items ADD COLUMN file_name_key TEXT NULL;");
                }

                Execute(connection, $"PRAGMA user_version = {userVersion};");
                Execute(connection, "PRAGMA wal_checkpoint(TRUNCATE);");
                if (standalone)
                {
                    Execute(connection, "PRAGMA journal_mode=DELETE;");
                }
            }

            if (File.Exists(staged + "-wal") || File.Exists(staged + "-shm"))
            {
                throw new InvalidOperationException("The seeded catalog kept a sidecar file.");
            }

            var destination = Path.Combine(directory, fileName);
            File.Move(staged, destination);
            return destination;
        }
        finally
        {
            Directory.Delete(staging, recursive: true);
        }
    }

    /// <summary>
    /// Holds <paramref name="path"/> open so that .NET cannot open it for reading until the handle is
    /// disposed: Windows refuses the share, and on Linux the advisory lock .NET takes blocks other .NET
    /// opens. SQLite on Linux does not use that lock and can still read the file.
    /// </summary>
    public static FileStream HoldUnreadable(string path) =>
        new(path, FileMode.Open, FileAccess.Read, FileShare.None);

    /// <summary>
    /// Holds an exclusive SQLite lock on a rollback-journal catalog (one written with <c>standalone</c>),
    /// so another connection that reads it fails with SQLITE_BUSY until the handle is disposed. Its
    /// header can still be read, and disposing it changes nothing.
    /// </summary>
    public static SqliteConnection HoldBusy(string databasePath)
    {
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWrite,
            Pooling = false
        }.ToString());
        connection.Open();
        Execute(connection, "BEGIN EXCLUSIVE;");
        return connection;
    }

    /// <summary>
    /// Overwrites the <c>catalog_meta</c> table page of a standalone catalog, so the schema check and
    /// the other tables still read, but reading the revision row fails as corrupt.
    /// </summary>
    public static void CorruptRevisionRow(string databasePath)
    {
        int rootPage;
        using (var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadOnly,
            Pooling = false
        }.ToString()))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT rootpage FROM sqlite_master WHERE type = 'table' AND name = 'catalog_meta';";
            rootPage = Convert.ToInt32(command.ExecuteScalar());
        }

        var bytes = File.ReadAllBytes(databasePath);
        var pageSize = (bytes[16] << 8) | bytes[17];
        if (pageSize == 1)
        {
            pageSize = 65536;
        }

        bytes.AsSpan((rootPage - 1) * pageSize, pageSize).Fill(0xFF);
        File.WriteAllBytes(databasePath, bytes);
    }

    /// <summary>The catalog store's case fold; a test keeps the two in step.</summary>
    public static string Fold(string value) => value.ToLowerInvariant();

    private static void Execute(SqliteConnection connection, string sql, params (string Name, object? Value)[] parameters)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        command.ExecuteNonQuery();
    }

    private const string Schema = """
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
        """;
}
