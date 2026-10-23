using ReelRoulette.Core.Randomization;
using Xunit;
using static ReelRoulette.Core.Tests.RandomPickTest;

namespace ReelRoulette.Core.Tests;

/// <summary>Spread by folder's skip of recent folders, and Spread by tags' weights.</summary>
public sealed class RandomPickSpreadTests
{
    private static readonly RandomPickOptions AllTags = new() { Shuffle = false, SpreadByFolder = false, SpreadByTags = TagSpreadValue.AllTags };

    private static RandomPickOptions ByCategory(params string[] categoryIds) => new()
    {
        Shuffle = false,
        SpreadByFolder = false,
        SpreadByTags = TagSpreadValue.ByCategory,
        SpreadCategoryIds = categoryIds
    };

    /// <summary>a and b are red, c and d blue: each tag is on half the files, so its rarity is 0.5.</summary>
    private static readonly RandomizationItem[] RedAndBlue =
    [
        Item("a", "/m/a.mp4", tags: Tag("red")),
        Item("b", "/m/b.mp4", tags: Tag("red")),
        Item("c", "/m/c.mp4", tags: Tag("blue")),
        Item("d", "/m/d.mp4", tags: Tag("blue"))
    ];

    [Fact]
    public void FolderSpread_SkipsTheFoldersOfTheLast16Picks_AndAllowsThe17thAgain()
    {
        var items = Enumerable.Range(0, 40).Select(i => Item($"f{i:D2}", $"/m/f{i:D2}/clip.mp4")).ToArray();
        var memory = new RandomPickMemory();
        PickIds(memory, items, FolderSpreadOnly, [.. items.Take(17).Select(item => item.Id)]);

        var odds = Odds(memory, items, FolderSpreadOnly);

        for (var i = 1; i <= 16; i++)
        {
            Assert.Equal(0, odds[$"f{i:D2}"]);
        }

        Assert.Equal(1.0 / 24, odds["f00"], Precision);
        Assert.Equal(1.0 / 24, odds["f17"], Precision);
    }

    [Theory]
    [InlineData(5, new[] { 1, 2 })]
    [InlineData(3, new[] { 2 })]
    [InlineData(2, new[] { 0 })]
    [InlineData(1, new int[0])]
    public void FolderSpread_SkipsTheFoldersOfAtMostHalfTheFolderCountOfPicks(int folderCount, int[] skippedFolders)
    {
        var items = Enumerable.Range(0, folderCount)
            .SelectMany(f => new[] { Item($"{f}a", $"/m/{f}/a.mp4"), Item($"{f}b", $"/m/{f}/b.mp4") })
            .ToArray();
        var memory = new RandomPickMemory();
        PickIds(memory, items, FolderSpreadOnly, "0a", $"{1 % folderCount}a", $"{2 % folderCount}a");

        var odds = Odds(memory, items, FolderSpreadOnly);

        var expected = 1.0 / (2 * (folderCount - skippedFolders.Length));
        for (var f = 0; f < folderCount; f++)
        {
            var folderOdds = skippedFolders.Contains(f) ? 0 : expected;
            Assert.Equal(folderOdds, odds[$"{f}a"], Precision);
            Assert.Equal(folderOdds, odds[$"{f}b"], Precision);
        }
    }

    [Fact]
    public void FolderSpread_IsIgnored_WhenTheSkippedFoldersHoldEveryFileLeft()
    {
        var items = new[] { Item("a1", "/a/a1.mp4"), Item("a2", "/a/a2.mp4"), Item("b1", "/b/b1.mp4") };
        var memory = new RandomPickMemory();
        PickIds(memory, items, RandomPickOptions.Default, "b1", "a1");

        // Shuffle leaves only a2, in the last pick's folder.
        AssertOdds(Odds(memory, items, RandomPickOptions.Default), ("a1", 0), ("a2", 1), ("b1", 0));
    }

    [Fact]
    public void FolderSpread_UsesTheImmediateParent_IgnoringCase()
    {
        var items = new[]
        {
            Item("a1", "/m/x/a1.mp4"),
            Item("a2", "/M/X/a2.mp4"),
            Item("a3", "/m/a3.mp4"),
            Item("a4", "/m/x/sub/a4.mp4")
        };
        var memory = new RandomPickMemory();
        PickId(memory, items, FolderSpreadOnly, "a1");

        AssertOdds(Odds(memory, items, FolderSpreadOnly), ("a1", 0), ("a2", 0), ("a3", 0.5), ("a4", 0.5));
    }

    [Fact]
    public void FolderSpread_SkipsAMovedFileByItsNewFolder()
    {
        var items = new[] { Item("a", "/one/a.mp4"), Item("b", "/two/b.mp4"), Item("c", "/three/c.mp4") };
        var memory = new RandomPickMemory();
        PickId(memory, items, FolderSpreadOnly, "c");
        Assert.Equal(0.5, Odds(memory, items, FolderSpreadOnly)["b"], Precision);

        var moved = new[] { items[0], Item("b", "/three/b.mp4"), items[2] };

        AssertOdds(Odds(memory, moved, FolderSpreadOnly), ("a", 1), ("b", 0), ("c", 0));
    }

    [Fact]
    public void TagSpread_DividesTheWeightOfFilesSharingARecentPicksTag()
    {
        var memory = new RandomPickMemory();
        PickId(memory, RedAndBlue, AllTags, "a");

        // Red appears once against its share of 0.5, at rarity 0.5: a divisor of 1 + 10 × 0.25 = 3.5.
        AssertOdds(Odds(memory, RedAndBlue, AllTags), ("a", 1 / 9.0), ("b", 1 / 9.0), ("c", 3.5 / 9), ("d", 3.5 / 9));
    }

    [Fact]
    public void TagSpread_CountsRarerTagsForMore()
    {
        var items = new[]
        {
            Item("r", "/m/r.mp4", tags: Tag("rare")),
            Item("c1", "/m/c1.mp4", tags: Tag("common")),
            Item("c2", "/m/c2.mp4", tags: Tag("common")),
            Item("c3", "/m/c3.mp4", tags: Tag("common")),
            Item("c4", "/m/c4.mp4", tags: Tag("common")),
            Item("o1", "/m/o1.mp4", tags: Tag("other")),
            Item("o2", "/m/o2.mp4", tags: Tag("other")),
            Item("o3", "/m/o3.mp4", tags: Tag("other"))
        };

        var rare = new RandomPickMemory();
        PickId(rare, items, AllTags, "r");
        var rareOdds = Odds(rare, items, AllTags);
        // Rare is on 1 of 8 files, rarity 1, and appears 1 - 1/8 = 0.875 beyond its share.
        var rareDivisor = rareOdds["o1"] / rareOdds["r"];
        Assert.Equal(1 + (10 * 0.875), rareDivisor, Precision);

        var common = new RandomPickMemory();
        PickId(common, items, AllTags, "c1");
        var commonOdds = Odds(common, items, AllTags);
        // Common is on 4 of 8 files, rarity ln 2 / ln 8 = 1/3, and appears 1 - 4/8 = 0.5 beyond its share.
        var commonDivisor = commonOdds["o1"] / commonOdds["c1"];
        Assert.Equal(1 + (10 * 0.5 / 3), commonDivisor, Precision);
        Assert.Equal(commonOdds["c1"], commonOdds["c4"], Precision);
        Assert.True(rareDivisor > commonDivisor);
    }

    [Fact]
    public void TagSpread_LeavesATagAtExactlyItsShareUnpenalized()
    {
        var memory = new RandomPickMemory();
        PickIds(memory, RedAndBlue, AllTags, "a", "c");

        AssertOdds(Odds(memory, RedAndBlue, AllTags), ("a", 0.25), ("b", 0.25), ("c", 0.25), ("d", 0.25));
    }

    [Fact]
    public void TagSpread_CountsNoTagsAsATagOfItsOwn()
    {
        var items = new[]
        {
            Item("a", "/m/a.mp4", tags: Tag("red")),
            Item("b", "/m/b.mp4", tags: Tag("red")),
            Item("u1", "/m/u1.mp4"),
            Item("u2", "/m/u2.mp4")
        };
        var memory = new RandomPickMemory();
        PickId(memory, items, AllTags, "u1");

        AssertOdds(Odds(memory, items, AllTags), ("a", 3.5 / 9), ("b", 3.5 / 9), ("u1", 1 / 9.0), ("u2", 1 / 9.0));
    }

    [Fact]
    public void ByCategory_CountsOnlyTheChosenCategoriesTags_AndOthersAsNoTags()
    {
        var items = new[]
        {
            Item("a", "/m/a.mp4", tags: [Tag("red", "colors"), Tag("big", "sizes")]),
            Item("b", "/m/b.mp4", tags: Tag("red", "colors")),
            Item("c", "/m/c.mp4", tags: [Tag("blue", "colors"), Tag("small", "sizes")]),
            Item("d", "/m/d.mp4", tags: Tag("big", "sizes")),
            Item("e", "/m/e.mp4", tags: Tag("small", "sizes"))
        };
        var memory = new RandomPickMemory();
        PickId(memory, items, ByCategory("COLORS"), "a");

        // All tags first, so the same memory then rebuilds its tags for By category. Red is on 2 of 5 files and big on
        // 2 of 5, each appearing 1 - 2/5 = 0.6 beyond its share.
        var twoOfFive = Math.Log(5 / 2.0) / Math.Log(5);
        var allTagsOdds = Odds(memory, items, AllTags);
        Assert.Equal(1 + (10 * 0.6 * twoOfFive * 2), allTagsOdds["c"] / allTagsOdds["a"], Precision);
        Assert.Equal(1 + (10 * 0.6 * twoOfFive), allTagsOdds["c"] / allTagsOdds["d"], Precision);

        // Under colors, d and e have no counted tag, so d shares nothing with a.
        var odds = Odds(memory, items, ByCategory("COLORS"));
        var redDivisor = 1 + (10 * 0.6 * twoOfFive);
        var total = (2 / redDivisor) + 3;
        AssertOdds(odds, ("a", 1 / redDivisor / total), ("b", 1 / redDivisor / total), ("c", 1 / total), ("d", 1 / total), ("e", 1 / total));

        // After d, which counts as having no tags, e, with only a sizes tag, is spread from it too.
        PickId(memory, items, ByCategory("colors"), "d");
        odds = Odds(memory, items, ByCategory("colors"));
        // Two recent picks: red appears 1 against its share of 2 × 2/5, and no tags 1 against 2 × 2/5.
        var divisor = 1 + (10 * 0.2 * twoOfFive);
        total = (4 / divisor) + 1;
        AssertOdds(odds, ("a", 1 / divisor / total), ("b", 1 / divisor / total), ("c", 1 / total), ("d", 1 / divisor / total), ("e", 1 / divisor / total));
    }

    [Fact]
    public void ByCategory_WithNoCategoryChosen_ChangesNoPick()
    {
        var memory = new RandomPickMemory();
        PickIds(memory, RedAndBlue, ByCategory(), "a", "b");

        AssertOdds(Odds(memory, RedAndBlue, ByCategory()), ("a", 0.25), ("b", 0.25), ("c", 0.25), ("d", 0.25));
    }

    [Fact]
    public void ByCategory_CountsANewChoiceOfCategories()
    {
        var items = new[]
        {
            Item("a", "/m/a.mp4", tags: [Tag("red", "colors"), Tag("big", "sizes")]),
            Item("b", "/m/b.mp4", tags: Tag("red", "colors")),
            Item("c", "/m/c.mp4", tags: Tag("big", "sizes")),
            Item("d", "/m/d.mp4")
        };
        var memory = new RandomPickMemory();
        PickId(memory, items, ByCategory("colors"), "b");

        // Under colors, b shares red with a. Each tag is on 2 of 4 files, rarity 0.5, and appears 1 - 2/4 = 0.5 beyond
        // its share: a divisor of 3.5.
        AssertOdds(Odds(memory, items, ByCategory("colors")), ("a", 1 / 9.0), ("b", 1 / 9.0), ("c", 3.5 / 9), ("d", 3.5 / 9));

        // Under sizes, b counts as having no tags, as d does, so b and d are spread instead of a and b.
        AssertOdds(Odds(memory, items, ByCategory("sizes")), ("a", 3.5 / 9), ("b", 1 / 9.0), ("c", 3.5 / 9), ("d", 1 / 9.0));
    }

    [Fact]
    public void TagSpread_LeavesOutRecentPicksOutsideTheEligibleSet()
    {
        var memory = new RandomPickMemory();
        PickId(memory, [.. RedAndBlue, Item("z", "/m/z.mp4", tags: Tag("red"))], AllTags, "z");

        AssertOdds(Odds(memory, RedAndBlue, AllTags), ("a", 0.25), ("b", 0.25), ("c", 0.25), ("d", 0.25));

        // Only a counts, so red's share is 1 × 2/4, as if z had never been picked.
        PickId(memory, RedAndBlue, AllTags, "a");
        AssertOdds(Odds(memory, RedAndBlue, AllTags), ("a", 1 / 9.0), ("b", 1 / 9.0), ("c", 3.5 / 9), ("d", 3.5 / 9));
    }

    [Fact]
    public void TagSpread_WithFewerThan16RecentPicks_SharesByTheCountedPicks()
    {
        var memory = new RandomPickMemory();
        PickIds(memory, RedAndBlue, AllTags, "a", "b");

        // Red appears twice against its share of 2 × 2/4 = 1: a divisor of 1 + 10 × 0.5 × 1 = 6.
        AssertOdds(Odds(memory, RedAndBlue, AllTags), ("a", 1 / 14.0), ("b", 1 / 14.0), ("c", 6 / 14.0), ("d", 6 / 14.0));
    }

    [Fact]
    public void TagSpread_LooksAtTheLast16PicksOnly_CountingARepeatEachTime()
    {
        var memory = new RandomPickMemory();
        PickIds(memory, RedAndBlue, AllTags, [.. Enumerable.Repeat("a", 17)]);

        // Red appears 16 times against its share of 16 × 2/4 = 8: a divisor of 1 + 10 × 0.5 × 8 = 41.
        AssertOdds(Odds(memory, RedAndBlue, AllTags), ("a", 1 / 84.0), ("b", 1 / 84.0), ("c", 41 / 84.0), ("d", 41 / 84.0));
    }

    [Fact]
    public void TagSpread_UsesATagEdit()
    {
        var memory = new RandomPickMemory();
        PickId(memory, RedAndBlue, AllTags, "a");
        var edited = new[] { RedAndBlue[0], Item("b", "/m/b.mp4", tags: Tag("blue")), RedAndBlue[2], RedAndBlue[3] };

        // Red is now on a alone, rarity 1, appearing 1 - 1/4 = 0.75 beyond its share: a divisor of 8.5.
        AssertOdds(Odds(memory, edited, AllTags), ("a", 1 / 26.5), ("b", 8.5 / 26.5), ("c", 8.5 / 26.5), ("d", 8.5 / 26.5));
    }
}
