using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// The tag editor routes refuse a change the catalog doesn't take with 409, or 404 for an apply to files no longer in
/// the library, and a reason the WebUI shows after the step that failed, and publish nothing.
/// </summary>
public sealed class TagEditorRouteTests : IDisposable
{
    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-tag-editor-route-tests", Guid.NewGuid().ToString("N"));
    private readonly ServerStateService _state = new();
    private readonly LibraryOperationsService _operations;

    public TagEditorRouteTests()
    {
        Directory.CreateDirectory(_tempDir);
        CatalogSeed.Write(
            _tempDir,
            categories: [new SeedCategory("people", "People", 0)],
            tags: [new SeedTag("Bob", "people")],
            items: [new SeedItem("item-1", Path.Combine(_tempDir, "clip.mp4")) { Tags = ["Bob"] }]);
        _operations = new LibraryOperationsService(CatalogOpen.Host(_tempDir), NullLogger<LibraryOperationsService>.Instance, _tempDir);
    }

    [Fact]
    public void UpsertTag_RefusesATagAlreadyInThatCategory()
    {
        var result = ServerHostComposition.UpsertTag(new UpsertTagRequest { Name = " Bob ", CategoryId = "people" }, _state, _operations);

        AssertRefused(result, "A tag named \"Bob\" already exists.");
    }

    [Fact]
    public void RenameTag_RefusesATagTheCatalogDoesntHave()
    {
        var result = ServerHostComposition.RenameTag(new RenameTagRequest { OldName = "Alice", NewName = "Alicia" }, _state, _operations);

        AssertRefused(result, "There's no tag named \"Alice\".");
    }

    [Fact]
    public void DeleteTag_RefusesATagTheCatalogDoesntHave_AsOneAddedAndDeletedBeforeASave()
    {
        var result = ServerHostComposition.DeleteTag(new DeleteTagRequest { Name = "Sunset" }, _state, _operations);

        AssertRefused(result, "There's no tag named \"Sunset\".");
    }

    [Fact]
    public void DeleteCategory_RefusesACategoryTheCatalogDoesntHave()
    {
        var result = ServerHostComposition.DeleteCategory(new DeleteCategoryRequest { CategoryId = "places" }, _state, _operations);

        AssertRefused(result, "That category doesn't exist.");
    }

    [Fact]
    public void ApplyItemTags_RefusesAChangeTheItemsAlreadyHave()
    {
        var result = ServerHostComposition.ApplyItemTags(
            new ApplyItemTagsRequest { ItemIds = ["item-1"], AddTags = ["Bob"], RemoveTags = ["Alice"] },
            _state,
            _operations);

        AssertRefused(result, "The tags were already that way.");
    }

    [Fact]
    public void ApplyItemTags_RefusesFilesNoLongerInTheLibrary_AsOneARefreshRemoved()
    {
        var result = ServerHostComposition.ApplyItemTags(
            new ApplyItemTagsRequest { ItemIds = ["gone"], AddTags = ["Bob"] },
            _state,
            _operations);

        AssertRefused(result, "The file is no longer in the library.", StatusCodes.Status404NotFound);
    }

    public void Dispose()
    {
        LibraryCatalogBackup.WaitForPending();
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    private void AssertRefused(IResult result, string reason, int status = StatusCodes.Status409Conflict)
    {
        Assert.Equal(status, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.Equal(reason, OpenApiSpec.ErrorReason(result));
        Assert.Empty(_state.GetReplayAfter(0).Events);
    }
}
