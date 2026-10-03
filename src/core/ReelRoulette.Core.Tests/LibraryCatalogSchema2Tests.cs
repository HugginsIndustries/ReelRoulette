using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Library;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibraryCatalogSchema2Tests
{
    [Fact]
    public void Open_Schema1Database_IsQuarantinedAndRefused()
    {
        using var dir = new TempDirectory();
        var thumbs = Path.Combine(dir.Path, "thumbnails");
        Directory.CreateDirectory(thumbs);
        CreateSchema1(dir.Path, "kept-tag");
        var schema1 = File.ReadAllBytes(Path.Combine(dir.Path, "library.db"));
        var presets = Path.Combine(dir.Path, "presets.json");
        var index = Path.Combine(thumbs, "index.json");
        File.WriteAllText(presets, """[{ "name": "Night", "filterState": { "favoritesOnly": true } }]""");
        File.WriteAllText(index, """{ "item-1": { "revision": "rev-1", "width": 11, "height": 22 } }""");
        var presetBytes = File.ReadAllBytes(presets);
        var indexBytes = File.ReadAllBytes(index);

        var refused = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Refused, refused.Status);
        Assert.Equal(LibraryCatalogStore.RefusedMessage, refused.Message);
        Assert.Null(refused.Session);
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db")));
        Assert.Equal(schema1, File.ReadAllBytes(Path.Combine(dir.Path, "library.db.refused")));
        Assert.Equal(presetBytes, File.ReadAllBytes(presets));
        Assert.Equal(indexBytes, File.ReadAllBytes(index));
        Assert.False(File.Exists(presets + ".migrated"));
        Assert.False(File.Exists(index + ".migrated"));
    }

    [Fact]
    public void Schema1File_IsNotALibraryDatabase_AndIsNotPrepared()
    {
        using var source = new TempDirectory();
        using var dest = new TempDirectory();
        CreateSchema1(source.Path, "kept-tag");
        var checkpoint = Path.Combine(source.Path, "library.db");

        Assert.Equal(LibraryCatalogStore.CatalogFileInspection.NotADatabase, LibraryCatalogStore.InspectCatalogFile(checkpoint));
        Assert.Equal(LibraryCatalogStore.DatabaseContentRead.Unreadable, LibraryCatalogStore.ReadDatabaseContent(checkpoint));
        Assert.Throws<InvalidDataException>(() => LibraryCatalogStore.PrepareIncomingFromFile(dest.Path, checkpoint));
        Assert.Empty(Directory.GetFiles(dest.Path, "library.db*"));
    }

    [Fact]
    public void Open_DoesNotDeleteThumbnailFiles()
    {
        using var dir = new TempDirectory();
        var orphan = Path.Combine(dir.Path, "thumbnails", "orphan.jpg");
        Directory.CreateDirectory(Path.GetDirectoryName(orphan)!);
        File.WriteAllBytes(orphan, [9, 9, 9]);

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        Assert.True(File.Exists(orphan));
    }

    [Fact]
    public void WriteCheckpoint_IncludesPresetsAndThumbnailColumns_AndNotJpegBytes()
    {
        using var dir = new TempDirectory();
        var marker = "JPEG-MARKER-" + Guid.NewGuid().ToString("N");
        var opened = CatalogOpen.Open(dir.Path);
        Assert.True(opened.Session!.InsertItem(new LibraryCatalogItem
        {
            Id = "item-1",
            FullPath = "/clips/a.mp4",
            FileName = "a.mp4"
        }));
        Assert.True(opened.Session.SetThumbnail("item-1", "rev-1", 12, 34));
        opened.Session.ReplacePresets(
        [
            new LibraryCatalogPreset { Name = "Night", FilterStateJson = """{"favoritesOnly":true}""" }
        ]);
        var jpeg = Path.Combine(dir.Path, "thumbnails", "item-1.jpg");
        Directory.CreateDirectory(Path.GetDirectoryName(jpeg)!);
        File.WriteAllText(jpeg, marker);

        var checkpoint = Path.Combine(dir.Path, "checkpoint.db");
        LibraryCatalogStore.WriteCheckpoint(opened.Session.DatabasePath, checkpoint);

        var bytes = File.ReadAllText(checkpoint);
        Assert.DoesNotContain(marker, bytes, StringComparison.Ordinal);
        using var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = checkpoint,
            Mode = SqliteOpenMode.ReadOnly,
            Pooling = false
        }.ToString());
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT name FROM presets;";
        Assert.Equal("Night", command.ExecuteScalar());
        command.CommandText = "SELECT thumbnail_revision, thumbnail_width, thumbnail_height FROM items WHERE id = 'item-1';";
        using var reader = command.ExecuteReader();
        Assert.True(reader.Read());
        Assert.Equal("rev-1", reader.GetString(0));
        Assert.Equal(12, reader.GetInt32(1));
        Assert.Equal(34, reader.GetInt32(2));
    }

    private static void CreateSchema1(string directory, string tagName)
    {
        var path = Path.Combine(directory, "library.db");
        using var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = path,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Pooling = false
        }.ToString());
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
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
                loudness_error TEXT NULL
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
            CREATE TABLE available_tags (
                position INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                name_fold TEXT NOT NULL
            );
            CREATE TABLE catalog_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT INTO categories (id, position, name, sort_order) VALUES ('uncategorized', 0, 'Uncategorized', 2147483647);
            INSERT INTO tags (position, name, name_fold, category_id) VALUES (0, $tag, $fold, 'uncategorized');
            INSERT INTO available_tags (position, name, name_fold) VALUES (0, 'LegacyOnly', 'legacyonly');
            INSERT INTO catalog_meta (key, value) VALUES ('available_tags_present', '1');
            INSERT INTO catalog_meta (key, value) VALUES ('revision', '0');
            INSERT INTO items (
                id, position, source_id, full_path, full_path_fold, relative_path, relative_path_fold,
                file_name, file_name_fold, is_favorite, is_blacklisted, play_count, media_type,
                fingerprint_algorithm, fingerprint_version)
            VALUES ('item-1', 0, '', '/clips/a.mp4', '/clips/a.mp4', 'a.mp4', 'a.mp4', 'a.mp4', 'a.mp4', 0, 0, 0, 0, 'SHA-256', 1);
            INSERT INTO items (
                id, position, source_id, full_path, full_path_fold, relative_path, relative_path_fold,
                file_name, file_name_fold, is_favorite, is_blacklisted, play_count, media_type,
                fingerprint_algorithm, fingerprint_version)
            VALUES ('item-2', 1, '', '/clips/b.mp4', '/clips/b.mp4', 'b.mp4', 'b.mp4', 'b.mp4', 'b.mp4', 0, 0, 0, 0, 'SHA-256', 1);
            PRAGMA user_version = 1;
            """;
        command.Parameters.AddWithValue("$tag", tagName);
        command.Parameters.AddWithValue("$fold", tagName.ToLowerInvariant());
        command.ExecuteNonQuery();
    }

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "rr-schema2-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch (IOException)
            {
            }
        }
    }
}
