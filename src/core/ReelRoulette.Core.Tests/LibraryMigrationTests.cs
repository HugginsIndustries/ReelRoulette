using System.Text.Json.Nodes;
using ReelRoulette.Core.Storage;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibraryMigrationTests
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
        var paths = LibraryMigration.CollectUniqueSourceRootPaths(root);
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

        var result = LibraryMigration.ApplySourceRemapping(root, remap, skipped);
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

        var result = LibraryMigration.ApplySourceRemapping(root, remap, skipped);
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
        var result = LibraryMigration.ApplySourceRemapping(
            root,
            new Dictionary<string, string>(StringComparer.Ordinal),
            new HashSet<string>(StringComparer.Ordinal));

        Assert.False(result.Success);
        Assert.Contains("neither skipped nor remapped", result.ErrorMessage ?? "", StringComparison.Ordinal);
    }

    [Fact]
    public void IsSafeZipEntryName_Rejects_Slip_And_Absolute()
    {
        Assert.False(LibraryMigration.IsSafeZipEntryName("../etc/passwd"));
        Assert.False(LibraryMigration.IsSafeZipEntryName("foo/../../bar"));
        Assert.False(LibraryMigration.IsSafeZipEntryName("/abs"));
        Assert.True(LibraryMigration.IsSafeZipEntryName("library.json"));
        Assert.True(LibraryMigration.IsSafeZipEntryName("thumbnails/ab/cd.jpg"));
    }

    [Fact]
    public void ValidateExportZipHasRequiredFiles_Requires_Root_Files()
    {
        var ok = new[] { "library.json", "core-settings.json", "presets.json", "desktop-settings.json", "export-manifest.json" };
        Assert.Null(LibraryMigration.ValidateExportZipHasRequiredFiles(ok));

        Assert.NotNull(LibraryMigration.ValidateExportZipHasRequiredFiles(["library.json"]));

        Assert.NotNull(LibraryMigration.ValidateExportZipHasRequiredFiles(
            ["nested/library.json", "core-settings.json", "presets.json", "desktop-settings.json", "export-manifest.json"]));
    }

    [Fact]
    public void BuildExportManifestJson_Includes_Roots()
    {
        var lib = JsonNode.Parse("""
            { "sources": [ { "id": "a", "rootPath": "/v" } ], "items": [] }
            """) as JsonObject;

        Assert.NotNull(lib);
        var json = LibraryMigration.BuildExportManifestJson(lib, "Linux", "9.9.9");
        Assert.Contains("\"sourceRootPaths\"", json, StringComparison.Ordinal);
        Assert.Contains("/v", json, StringComparison.Ordinal);
    }
}
