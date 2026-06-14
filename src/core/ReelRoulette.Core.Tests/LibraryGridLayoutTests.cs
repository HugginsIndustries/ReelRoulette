using ReelRoulette.Core.Library;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibraryGridLayoutTests
{
    [Fact]
    public void GetAspectRatio_UsesThumbnailDimensionsWhenPresent()
    {
        var aspect = LibraryGridLayout.GetAspectRatio(480, 270, LibraryGridMediaType.Video);
        Assert.Equal(16d / 9d, aspect, 3);
    }

    [Fact]
    public void GetAspectRatio_ClampsExtremeValues()
    {
        Assert.Equal(LibraryGridLayout.MaxAspectRatio, LibraryGridLayout.GetAspectRatio(1000, 100, LibraryGridMediaType.Video));
        Assert.Equal(LibraryGridLayout.MinAspectRatio, LibraryGridLayout.GetAspectRatio(100, 1000, LibraryGridMediaType.Video));
    }

    [Fact]
    public void GetAspectRatio_UsesMediaTypeFallbackWhenDimensionsMissing()
    {
        Assert.Equal(LibraryGridLayout.FallbackPhotoAspectRatio, LibraryGridLayout.GetAspectRatio(0, 0, LibraryGridMediaType.Photo));
        Assert.Equal(LibraryGridLayout.FallbackVideoAspectRatio, LibraryGridLayout.GetAspectRatio(0, 0, LibraryGridMediaType.Video));
    }

    [Fact]
    public void BuildRows_PacksAllItemsAcrossRows()
    {
        var aspects = new[] { 16d / 9d, 4d / 3d, 16d / 9d, 1d, 16d / 9d };
        var result = LibraryGridLayout.BuildRows(aspects, 0, aspects.Length, 920);

        Assert.Equal(5, result.Rows.Sum(row => row.ItemCount));
        Assert.True(result.MaxColumns >= 2);
        Assert.All(result.Rows, row => Assert.InRange(row.RowHeight, LibraryGridLayout.MinRowHeight, LibraryGridLayout.MaxRowHeight));
    }

    [Fact]
    public void BuildRows_HonorsPartialRange()
    {
        var aspects = new[] { 16d / 9d, 4d / 3d, 16d / 9d };
        var result = LibraryGridLayout.BuildRows(aspects, 1, 3, 640);

        Assert.Single(result.Rows);
        Assert.Equal(2, result.Rows[0].ItemCount);
        Assert.Equal(1, result.Rows[0].StartItemIndex);
        Assert.Equal(3, result.Rows[0].EndItemIndexExclusive);
    }

    [Fact]
    public void ComputeAvailableLayoutWidth_AppliesGutterAndMinimum()
    {
        Assert.Equal(280, LibraryGridLayout.ComputeAvailableLayoutWidth(100));
        Assert.Equal(992, LibraryGridLayout.ComputeAvailableLayoutWidth(1000));
    }
}
