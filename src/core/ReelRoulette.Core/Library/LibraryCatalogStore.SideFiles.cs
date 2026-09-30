using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;

namespace ReelRoulette.Core.Library;

public static partial class LibraryCatalogStore
{
    private enum SchemaMigration
    {
        None,
        Schema1,
        SideFiles
    }

    private static readonly JsonSerializerOptions PresetJsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    private static SchemaMigration TryMigrateSchema(string directory, string databasePath, LibraryCatalogOpenOptions? options)
    {
        var thumbnailDirectory = options?.ThumbnailDirectory;
        if (string.IsNullOrWhiteSpace(thumbnailDirectory))
        {
            return SchemaMigration.None;
        }

        using var connection = OpenWrite(databasePath);
        var version = ExecuteScalarInt(connection, "PRAGMA user_version;");
        if (version == SchemaVersion)
        {
            if (SideFilesCopied(connection) || !HasStrictSchema2(connection))
            {
                return SchemaMigration.None;
            }

            using var pending = connection.BeginTransaction();
            CopySideFiles(connection, pending, directory, thumbnailDirectory);
            pending.Commit();
            return SchemaMigration.SideFiles;
        }

        if (version != PreviousSchemaVersion || !HasTables(connection, Schema1Tables) || !HasItemColumn(connection, "loudness_error"))
        {
            return SchemaMigration.None;
        }

        using var transaction = connection.BeginTransaction();
        Execute(connection, transaction, "DROP TABLE IF EXISTS available_tags;");
        Execute(connection, transaction, "DELETE FROM catalog_meta WHERE key = 'available_tags_present';");
        Execute(connection, transaction, """
            CREATE TABLE presets (
                position INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                name_fold TEXT NOT NULL,
                filter_state TEXT NOT NULL
            );
            """);
        Execute(connection, transaction, "ALTER TABLE items ADD COLUMN thumbnail_revision TEXT NULL;");
        Execute(connection, transaction, "ALTER TABLE items ADD COLUMN thumbnail_width INTEGER NULL;");
        Execute(connection, transaction, "ALTER TABLE items ADD COLUMN thumbnail_height INTEGER NULL;");
        CopySideFiles(connection, transaction, directory, thumbnailDirectory);
        Execute(connection, transaction, $"PRAGMA user_version = {SchemaVersion};");
        transaction.Commit();
        return SchemaMigration.Schema1;
    }

    private static void FinishSideFileCopy(
        string directory,
        string databasePath,
        LibraryCatalogOpenOptions? options,
        bool copiedThisOpen)
    {
        if (!SideFilesCopied(databasePath))
        {
            return;
        }

        if (copiedThisOpen)
        {
            options?.AfterSideFileCopy?.Invoke();
        }

        RenameSideFile(Path.Combine(directory, PresetsFileName));
        if (!string.IsNullOrWhiteSpace(options?.ThumbnailDirectory))
        {
            RenameSideFile(Path.Combine(options.ThumbnailDirectory, ThumbnailIndexFileName));
        }
    }

    private static void CopySideFiles(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string catalogDirectory,
        string thumbnailDirectory)
    {
        InsertPresets(connection, transaction, ReadPresetsFile(Path.Combine(catalogDirectory, PresetsFileName)));
        ApplyThumbnailIndex(connection, transaction, Path.Combine(thumbnailDirectory, ThumbnailIndexFileName));
        Execute(
            connection,
            transaction,
            "INSERT INTO catalog_meta (key, value) VALUES ('side_files_copied', '1');");
    }

    private static void InsertPresets(
        SqliteConnection connection,
        SqliteTransaction transaction,
        IReadOnlyList<LibraryCatalogPreset> presets)
    {
        for (var i = 0; i < presets.Count; i++)
        {
            var preset = presets[i];
            Execute(
                connection,
                transaction,
                """
                INSERT INTO presets (position, name, name_fold, filter_state)
                VALUES ($position, $name, $fold, $filter);
                """,
                ("$position", i),
                ("$name", preset.Name),
                ("$fold", Fold(preset.Name)),
                ("$filter", preset.FilterStateJson));
        }
    }

    private static List<LibraryCatalogPreset> ReadPresetsFile(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return [];
            }

            var parsed = JsonSerializer.Deserialize<List<PresetFileRow>>(File.ReadAllText(path), PresetJsonOptions) ?? [];
            var kept = new List<LibraryCatalogPreset>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var row in parsed)
            {
                var name = row.Name?.Trim();
                if (string.IsNullOrWhiteSpace(name) || !seen.Add(name))
                {
                    continue;
                }

                var filter = row.FilterState.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null
                    ? "{}"
                    : row.FilterState.GetRawText();
                kept.Add(new LibraryCatalogPreset
                {
                    Name = name,
                    FilterStateJson = filter
                });
            }

            return kept;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            return [];
        }
    }

    private static void ApplyThumbnailIndex(SqliteConnection connection, SqliteTransaction transaction, string path)
    {
        JsonObject? root;
        try
        {
            if (!File.Exists(path))
            {
                return;
            }

            root = JsonNode.Parse(File.ReadAllText(path)) as JsonObject;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            return;
        }

        if (root == null)
        {
            return;
        }

        foreach (var pair in root)
        {
            if (string.IsNullOrWhiteSpace(pair.Key))
            {
                continue;
            }

            var (revision, width, height) = ReadThumbnailIndexEntry(pair.Value);
            Execute(
                connection,
                transaction,
                """
                UPDATE items
                SET thumbnail_revision = $revision,
                    thumbnail_width = $width,
                    thumbnail_height = $height
                WHERE id = $id;
                """,
                ("$id", pair.Key),
                ("$revision", (object?)revision ?? DBNull.Value),
                ("$width", width is > 0 ? width.Value : DBNull.Value),
                ("$height", height is > 0 ? height.Value : DBNull.Value));
        }
    }

    private static (string? Revision, int? Width, int? Height) ReadThumbnailIndexEntry(JsonNode? node)
    {
        if (node is JsonValue)
        {
            string? revision;
            try
            {
                revision = node.GetValue<string>();
            }
            catch (InvalidOperationException)
            {
                return (null, null, null);
            }

            return (string.IsNullOrEmpty(revision) ? null : revision, null, null);
        }

        if (node is not JsonObject obj)
        {
            return (null, null, null);
        }

        string? stored = null;
        try
        {
            stored = obj["revision"]?.GetValue<string>();
        }
        catch (InvalidOperationException)
        {
            stored = null;
        }

        return (string.IsNullOrEmpty(stored) ? null : stored, PositiveDimension(obj["width"]), PositiveDimension(obj["height"]));
    }

    private static int? PositiveDimension(JsonNode? node)
    {
        if (node is not JsonValue value)
        {
            return null;
        }

        if (value.TryGetValue<int>(out var number))
        {
            return number > 0 ? number : null;
        }

        if (value.TryGetValue<long>(out var wide) && wide is > 0 and <= int.MaxValue)
        {
            return (int)wide;
        }

        return null;
    }

    private static bool SideFilesCopied(string databasePath)
    {
        using var connection = OpenReadOnly(databasePath);
        return SideFilesCopied(connection);
    }

    private static bool SideFilesCopied(SqliteConnection connection)
    {
        return ExecuteScalarString(connection, $"SELECT value FROM catalog_meta WHERE key = '{SideFilesCopiedKey}';") == "1";
    }

    private static void RenameSideFile(string sourcePath)
    {
        if (!File.Exists(sourcePath))
        {
            return;
        }

        File.Move(sourcePath, sourcePath + ".migrated", overwrite: true);
    }

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

    private sealed class PresetFileRow
    {
        public string? Name { get; set; }
        public JsonElement FilterState { get; set; }
    }
}
