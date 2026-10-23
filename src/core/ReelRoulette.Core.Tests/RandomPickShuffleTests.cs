using ReelRoulette.Core.Randomization;
using Xunit;
using static ReelRoulette.Core.Tests.RandomPickTest;

namespace ReelRoulette.Core.Tests;

/// <summary>Shuffle's memory of picks per device, its window, and its cycles.</summary>
public sealed class RandomPickShuffleTests
{
    private static readonly RandomizationItem[] Five =
    [
        Item("a", "/m/a.mp4"),
        Item("b", "/m/b.mp4"),
        Item("c", "/m/c.mp4"),
        Item("d", "/m/d.mp4"),
        Item("e", "/m/e.mp4")
    ];

    private static RandomPickOptions ShuffleFor(int? days) => new() { Shuffle = true, SpreadByFolder = false, RememberPlaysForDays = days };

    [Fact]
    public void Shuffle_LeavesOutTheFilesPickedWithinTheWindow()
    {
        var memory = new RandomPickMemory();
        PickIds(memory, Five, ShuffleOnly, "a", "b");

        AssertOdds(Odds(memory, Five, ShuffleOnly), ("a", 0), ("b", 0), ("c", 1.0 / 3), ("d", 1.0 / 3), ("e", 1.0 / 3));
    }

    [Fact]
    public void NewCycle_ClearsThePicks_AndLeavesOutTheLastPick()
    {
        var items = Five[..3];
        var memory = new RandomPickMemory();
        PickIds(memory, items, ShuffleOnly, "a", "b", "c");

        var odds = RandomSelectionEngineCore.ComputeOdds(memory, items, ShuffleOnly, Now);
        Assert.True(odds.StartsNewCycle);
        AssertOdds(Odds(memory, items, ShuffleOnly), ("a", 0.5), ("b", 0.5), ("c", 0));

        PickId(memory, items, ShuffleOnly, "a");

        AssertOdds(Odds(memory, items, ShuffleOnly), ("a", 0), ("b", 0.5), ("c", 0.5));
    }

    [Fact]
    public void NewCycle_KeepsThePicksOfFilesOutsideTheSet()
    {
        var memory = new RandomPickMemory();
        PickIds(memory, Five, ShuffleOnly, "d", "a", "b");

        PickId(memory, Five[..2], ShuffleOnly, "a");

        Assert.True(memory.Picks.ContainsKey("d"));
        Assert.False(memory.Picks.ContainsKey("b"));
    }

    [Fact]
    public void OneFileSet_PicksThatFileEveryTime()
    {
        var items = Five[..1];
        var memory = new RandomPickMemory();

        for (var i = 0; i < 3; i++)
        {
            var picked = RandomSelectionEngineCore.SelectItem(memory, items, ShuffleOnly, Now.AddMinutes(i), new ScriptedRandom(0.5));
            Assert.Equal("a", picked!.Item.Id);
            Assert.Equal(new RandomPickCycle(1, 1), picked.Cycle);
        }
    }

    [Fact]
    public void APick_DropsOutExactlyAtTheWindowsEnd()
    {
        var options = ShuffleFor(1);
        var memory = new RandomPickMemory();
        PickId(memory, Five, options, "a");

        Assert.Equal(0, Odds(memory, Five, options, Now.AddDays(1).AddTicks(-1))["a"]);
        Assert.Equal(0.2, Odds(memory, Five, options, Now.AddDays(1))["a"], Precision);

        PickId(memory, Five, options, "b", Now.AddDays(1));
        Assert.False(memory.Picks.ContainsKey("a"));
    }

    [Fact]
    public void UntilEverythingHasPlayed_NeverDropsAPick()
    {
        var options = ShuffleFor(null);
        var memory = new RandomPickMemory();
        PickId(memory, Five, options, "a");
        PickId(memory, Five, options, "b", Now.AddYears(10));

        Assert.Equal(0, Odds(memory, Five, options, Now.AddYears(10))["a"]);
        Assert.True(memory.Picks.ContainsKey("a"));
    }

    [Fact]
    public void Memory_SurvivesAChangeToTheEligibleSet()
    {
        var memory = new RandomPickMemory();
        PickIds(memory, Five, ShuffleOnly, "a", "b");
        var changed = Five.Where(item => item.Id != "b").Append(Item("f", "/m/f.mp4")).ToArray();

        AssertOdds(Odds(memory, changed, ShuffleOnly), ("a", 0), ("c", 0.25), ("d", 0.25), ("e", 0.25), ("f", 0.25));
        PickId(memory, changed, ShuffleOnly, "c");

        AssertOdds(Odds(memory, Five, ShuffleOnly), ("a", 0), ("b", 0), ("c", 0), ("d", 0.5), ("e", 0.5));
    }

    [Fact]
    public void Memory_SurvivesAChangeToTheOptions()
    {
        var memory = new RandomPickMemory();
        PickIds(memory, Five, ShuffleOnly, "a", "b");
        var changed = new RandomPickOptions { Shuffle = true, SpreadByFolder = true, RememberPlaysForDays = 7, FavorHigherRated = true };
        PickId(memory, Five, changed, "c");

        AssertOdds(Odds(memory, Five, ShuffleOnly), ("a", 0), ("b", 0), ("c", 0), ("d", 0.5), ("e", 0.5));
    }

    [Fact]
    public void PicksMadeWithShuffleOff_AreLeftOutOnceShuffleIsOn()
    {
        var memory = new RandomPickMemory();
        PickIds(memory, Five, AllOff, "a", "b");

        AssertOdds(Odds(memory, Five, ShuffleOnly), ("a", 0), ("b", 0), ("c", 1.0 / 3), ("d", 1.0 / 3), ("e", 1.0 / 3));
    }

    [Fact]
    public void ShuffleOff_AllowsRepeats_AndKeepsTheLastPickAtANewCycle()
    {
        var items = Five[..2];
        var memory = new RandomPickMemory();
        PickIds(memory, items, AllOff, "a", "a");
        AssertOdds(Odds(memory, items, AllOff), ("a", 0.5), ("b", 0.5));

        PickId(memory, items, AllOff, "b");

        Assert.True(RandomSelectionEngineCore.ComputeOdds(memory, items, AllOff, Now).StartsNewCycle);
        AssertOdds(Odds(memory, items, AllOff), ("a", 0.5), ("b", 0.5));
    }

    [Fact]
    public void ShorteningThenLengtheningTheWindow_DoesNotBringPicksBack()
    {
        var memory = new RandomPickMemory();
        PickId(memory, Five, ShuffleFor(30), "a", Now.AddDays(-10));
        PickId(memory, Five, ShuffleFor(7), "b");

        AssertOdds(Odds(memory, Five, ShuffleFor(30)), ("a", 0.25), ("b", 0), ("c", 0.25), ("d", 0.25), ("e", 0.25));
    }

    [Fact]
    public void Reset_ClearsThePicksAndTheLastPick_AndKeepsSpreadsRecentFolders()
    {
        var items = new[] { Item("a1", "/a/a1.mp4"), Item("b1", "/b/b1.mp4"), Item("c1", "/c/c1.mp4") };
        var options = RandomPickOptions.Default;
        var memory = new RandomPickMemory();
        PickIds(memory, items, options, "a1", "b1");

        RandomSelectionEngineCore.Reset(memory);

        Assert.Empty(memory.Picks);
        Assert.Null(memory.LastPickId);
        Assert.Equal(0, RandomSelectionEngineCore.GetCycle(memory, items, options, Now).Picked);
        // Three folders skip the last pick's folder, b, and nothing else is left out.
        AssertOdds(Odds(memory, items, options), ("a1", 0.5), ("b1", 0), ("c1", 0.5));
    }
}
