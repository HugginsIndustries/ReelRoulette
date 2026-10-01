using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LibraryConnectReadsTests
{
    [Fact]
    public void SessionPaths_DoNotRequestTheFullCatalog()
    {
        Assert.Equal(
            ["/api/library/stats", "/api/sources", "/api/tag-editor/model"],
            LibraryConnectReads.SessionPaths);
        Assert.Equal("/api/library/item", LibraryConnectReads.ItemPath);
    }
}
