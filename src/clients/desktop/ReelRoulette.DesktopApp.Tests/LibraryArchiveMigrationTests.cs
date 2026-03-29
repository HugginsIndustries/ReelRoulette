using System.Text.Json.Nodes;
using ReelRoulette.LibraryArchive;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LibraryArchiveMigrationTests
{
    [Fact]
    public void CollectUniqueSourceRootPaths_Dedupes_And_Sorts()
    {
        var root = JsonNode.Parse("""
            {
              "sources": [
                { "id": "a", "rootPath": "/z" },
                { "id": "b", "rootPath": "/a" },
                { "id": "c", "rootPath": "/a" }
              ],
              "items": []
            }
            """) as JsonObject;

        Assert.NotNull(root);
        var paths = LibraryArchiveMigration.CollectUniqueSourceRootPaths(root);
        Assert.Equal(new[] { "/a", "/z" }, paths);
    }

    [Fact]
    public void ApplySourceRemapping_Updates_Source_And_Item_FullPath()
    {
        var root = JsonNode.Parse("""
            {
              "sources": [
                { "id": "s1", "rootPath": "D:/Media", "displayName": "M", "isEnabled": true }
              ],
              "items": [
                {
                  "id": "i1",
                  "sourceId": "s1",
                  "fullPath": "D:/Media/vid/a.mp4",
                  "relativePath": "vid/a.mp4",
                  "fileName": "a.mp4"
                }
              ]
            }
            """) as JsonObject;

        Assert.NotNull(root);
        var remap = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["D:/Media"] = "/mnt/media"
        };
        var skipped = new HashSet<string>(StringComparer.Ordinal);

        var result = LibraryArchiveMigration.ApplySourceRemapping(root, remap, skipped);
        Assert.True(result.Success, result.ErrorMessage);

        var src = root["sources"]![0]!;
        Assert.Equal("/mnt/media", src["rootPath"]!.GetValue<string>());

        var item = root["items"]![0]!;
        var full = item["fullPath"]!.GetValue<string>();
        var expected = Path.GetFullPath(Path.Combine("/mnt/media", "vid", "a.mp4"));
        Assert.Equal(expected, full);
    }

    [Fact]
    public void ApplySourceRemapping_Skipped_Source_Leaves_Item_Paths()
    {
        var root = JsonNode.Parse("""
            {
              "sources": [
                { "id": "s1", "rootPath": "/old", "displayName": "M", "isEnabled": true }
              ],
              "items": [
                {
                  "id": "i1",
                  "sourceId": "s1",
                  "fullPath": "/old/x.mp4",
                  "relativePath": "x.mp4",
                  "fileName": "x.mp4"
                }
              ]
            }
            """) as JsonObject;

        Assert.NotNull(root);
        var remap = new Dictionary<string, string>(StringComparer.Ordinal);
        var skipped = new HashSet<string>(StringComparer.Ordinal) { "/old" };

        var result = LibraryArchiveMigration.ApplySourceRemapping(root, remap, skipped);
        Assert.True(result.Success, result.ErrorMessage);

        Assert.Equal("/old", root["sources"]![0]!["rootPath"]!.GetValue<string>());
        Assert.Equal("/old/x.mp4", root["items"]![0]!["fullPath"]!.GetValue<string>());
    }

    [Fact]
    public void ApplySourceRemapping_Fails_When_Root_Not_Covered()
    {
        var root = JsonNode.Parse("""
            {
              "sources": [ { "id": "s1", "rootPath": "/x", "isEnabled": true } ],
              "items": []
            }
            """) as JsonObject;

        Assert.NotNull(root);
        var result = LibraryArchiveMigration.ApplySourceRemapping(
            root,
            new Dictionary<string, string>(StringComparer.Ordinal),
            new HashSet<string>(StringComparer.Ordinal));

        Assert.False(result.Success);
        Assert.Contains("neither skipped nor remapped", result.ErrorMessage ?? "", StringComparison.Ordinal);
    }

    [Fact]
    public void IsSafeZipEntryName_Rejects_Slip_And_Absolute()
    {
        Assert.False(LibraryArchiveMigration.IsSafeZipEntryName("../etc/passwd"));
        Assert.False(LibraryArchiveMigration.IsSafeZipEntryName("foo/../../bar"));
        Assert.False(LibraryArchiveMigration.IsSafeZipEntryName("/abs"));
        Assert.True(LibraryArchiveMigration.IsSafeZipEntryName("library.json"));
        Assert.True(LibraryArchiveMigration.IsSafeZipEntryName("thumbnails/ab/cd.jpg"));
    }

    [Fact]
    public void ValidateExportZipHasRequiredFiles_Requires_Root_Files()
    {
        var ok = new[] { "library.json", "core-settings.json", "presets.json", "desktop-settings.json", "export-manifest.json" };
        Assert.Null(LibraryArchiveMigration.ValidateExportZipHasRequiredFiles(ok));

        Assert.NotNull(LibraryArchiveMigration.ValidateExportZipHasRequiredFiles(["library.json"]));

        Assert.NotNull(LibraryArchiveMigration.ValidateExportZipHasRequiredFiles(
            ["nested/library.json", "core-settings.json", "presets.json", "desktop-settings.json", "export-manifest.json"]));
    }

    [Fact]
    public void BuildExportManifestJson_Includes_Roots()
    {
        var lib = JsonNode.Parse("""
            { "sources": [ { "id": "a", "rootPath": "/v" } ], "items": [] }
            """) as JsonObject;

        Assert.NotNull(lib);
        var json = LibraryArchiveMigration.BuildExportManifestJson(lib, "Linux", "9.9.9");
        Assert.Contains("\"sourceRootPaths\"", json, StringComparison.Ordinal);
        Assert.Contains("/v", json, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Export_Then_Import_RoundTrip_With_Explicit_Paths()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "rr-desktop-migration-test-" + Guid.NewGuid().ToString("N"));
        var roaming = Path.Combine(tempRoot, "roaming");
        var thumbs = Path.Combine(tempRoot, "thumbnails");
        var backups = Path.Combine(roaming, "backups");
        Directory.CreateDirectory(roaming);
        Directory.CreateDirectory(thumbs);

        var paths = new LibraryArchiveDataPaths(roaming, thumbs, backups);

        var libraryJson = """
            {"sources":[{"id":"s1","rootPath":"/from","displayName":"x","isEnabled":true}],"items":[]}
            """;
        await File.WriteAllTextAsync(Path.Combine(roaming, "library.json"), libraryJson);
        await File.WriteAllTextAsync(Path.Combine(roaming, "presets.json"), "[]");
        await File.WriteAllTextAsync(Path.Combine(roaming, "core-settings.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(roaming, "desktop-settings.json"), "{}");

        await using (var zipOut = new MemoryStream())
        {
            await LibraryArchiveMigration.WriteExportZipAsync(zipOut, false, false, CancellationToken.None, paths);
            zipOut.Position = 0;

            var destRoaming = Path.Combine(tempRoot, "dest");
            var destThumbs = Path.Combine(tempRoot, "dest-thumbs");
            Directory.CreateDirectory(destRoaming);
            var destPaths = new LibraryArchiveDataPaths(destRoaming, destThumbs, Path.Combine(destRoaming, "backups"));

            var remap = new Dictionary<string, string>(StringComparer.Ordinal) { ["/from"] = "/to" };
            var skipped = new HashSet<string>(StringComparer.Ordinal);
            var result = LibraryArchiveMigration.ImportFromZipStream(zipOut, remap, skipped, force: true, destPaths);
            Assert.True(result.Accepted, result.Message);
            Assert.True(File.Exists(Path.Combine(destRoaming, "library.json")));
            var imported = await File.ReadAllTextAsync(Path.Combine(destRoaming, "library.json"));
            Assert.Contains("/to", imported, StringComparison.Ordinal);
        }

        try
        {
            Directory.Delete(tempRoot, recursive: true);
        }
        catch
        {
            // best-effort cleanup
        }
    }
}
