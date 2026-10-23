using ReelRoulette.Core.Randomization;
using Xunit;
using static ReelRoulette.Core.Tests.RandomPickTest;

namespace ReelRoulette.Core.Tests;

/// <summary>Every option off, and the option combinations that stand for the old randomization modes.</summary>
public sealed class RandomPickModeTests
{
    private static readonly RandomizationItem[] MixedItems =
    [
        Item("a", "/one/a.mp4", playCount: 9, lastPlayed: Now.AddDays(-1), rating: 10, tags: Tag("red")),
        Item("b", "/one/b.mp4", added: Now, created: Now),
        Item("c", "/two/c.mp4", rating: 1),
        Item("d", "/three/d.mp4", playCount: 1_000, lastPlayed: Now, tags: Tag("blue"))
    ];

    [Fact]
    public void AllOptionsOff_GivesEveryFileEqualOdds_EvenAfterPicks()
    {
        var memory = new RandomPickMemory();
        AssertOdds(Odds(memory, MixedItems, AllOff), ("a", 0.25), ("b", 0.25), ("c", 0.25), ("d", 0.25));

        PickIds(memory, MixedItems, AllOff, "a", "a", "d");

        AssertOdds(Odds(memory, MixedItems, AllOff), ("a", 0.25), ("b", 0.25), ("c", 0.25), ("d", 0.25));
    }

    [Theory]
    [InlineData(0.0, "a")]
    [InlineData(0.2499, "a")]
    [InlineData(0.25, "b")]
    [InlineData(0.5, "c")]
    [InlineData(0.9999, "d")]
    public void AllOptionsOff_OneRollPicksByPosition(double roll, string expected)
    {
        var picked = RandomSelectionEngineCore.SelectItem(new RandomPickMemory(), MixedItems, AllOff, Now, new ScriptedRandom(roll));

        Assert.Equal(expected, picked!.Item.Id);
    }

    [Fact]
    public void NoEligibleFiles_PicksNothing_AndLeavesTheMemoryAlone()
    {
        var memory = new RandomPickMemory();
        PickId(memory, MixedItems, RandomPickOptions.Default, "a");

        Assert.Null(RandomSelectionEngineCore.SelectItem(memory, [], RandomPickOptions.Default, Now, new ScriptedRandom()));
        Assert.Single(memory.Picks);
        Assert.Single(memory.RecentPicks);
        Assert.Equal("a", memory.LastPickId);
    }

    [Fact]
    public void SmartShuffle_PlaysEveryFileOnceBeforeRepeating_AndNeverRepeatsAcrossACycle()
    {
        var items = Enumerable.Range(0, 25).Select(i => Item($"id-{i:D2}", $"/media/{i % 4}/clip-{i}.mp4")).ToList();
        var memory = new RandomPickMemory();
        var random = new Random(11);
        string? previous = null;

        for (var cycle = 0; cycle < 3; cycle++)
        {
            var picked = new List<string>();
            for (var i = 0; i < items.Count; i++)
            {
                picked.Add(RandomSelectionEngineCore.SelectItem(memory, items, ShuffleOnly, Now.AddMinutes((cycle * 25) + i), random)!.Item.Id);
            }

            Assert.Equal(items.Select(item => item.Id), picked.Order(StringComparer.Ordinal));
            Assert.NotEqual(previous, picked[0]);
            previous = picked[^1];
        }
    }

    [Fact]
    public void WeightedRandom_WeighsByPlayCountAndRecency()
    {
        var options = new RandomPickOptions { Shuffle = false, SpreadByFolder = false, FavorLessPlayed = true };
        // Never played 0.6 + 0.8 = 1.4; one play 15 days ago 0.3 + 0.4 = 0.7; three plays, played now 0.15 + 0.04 = 0.19;
        // heavy is floored at 0.05. Total 2.34.
        var items = new[]
        {
            Item("never", "/m/never.mp4"),
            Item("half", "/m/half.mp4", playCount: 1, lastPlayed: Now.AddDays(-15)),
            Item("recent", "/m/recent.mp4", playCount: 3, lastPlayed: Now.AddDays(1)),
            Item("heavy", "/m/heavy.mp4", playCount: 1_000_000, lastPlayed: Now.AddDays(1))
        };

        AssertOdds(
            Odds(new RandomPickMemory(), items, options),
            ("never", 1.4 / 2.34),
            ("half", 0.7 / 2.34),
            ("recent", 0.19 / 2.34),
            ("heavy", 0.05 / 2.34));
        Assert.Equal("half", RandomSelectionEngineCore.SelectItem(new RandomPickMemory(), items, options, Now, new ScriptedRandom(0.6))!.Item.Id);
    }

    [Fact]
    public void Spread_SkipsTheLastPicksFolder_IgnoringCase()
    {
        var items = new[] { Item("a1", "/a/a1.mp4"), Item("a2", "/A/a2.mp4"), Item("b1", "/b/b1.mp4") };
        var memory = new RandomPickMemory();
        PickId(memory, items, FolderSpreadOnly, "a1");

        AssertOdds(Odds(memory, items, FolderSpreadOnly), ("a1", 0), ("a2", 0), ("b1", 1));
    }

    [Fact]
    public void WeightedWithSpread_SkipsTheLastPicksFolder_AndWeighsTheRestByPlays()
    {
        var options = new RandomPickOptions { Shuffle = false, SpreadByFolder = true, FavorLessPlayed = true };
        var items = new[]
        {
            Item("a1", "/a/a1.mp4"),
            Item("a2", "/a/a2.mp4"),
            Item("b1", "/b/b1.mp4", playCount: 1, lastPlayed: Now.AddDays(-15)),
            Item("b2", "/b/b2.mp4"),
            Item("c1", "/c/c1.mp4")
        };
        var memory = new RandomPickMemory();
        PickId(memory, items, options, "a1");

        // Folder a is skipped, and b1 weighs 0.7 against 1.4 for the others. Total 3.5.
        AssertOdds(Odds(memory, items, options), ("a1", 0), ("a2", 0), ("b1", 0.2), ("b2", 0.4), ("c1", 0.4));
    }
}
