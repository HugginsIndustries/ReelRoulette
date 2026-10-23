using ReelRoulette.Core.Randomization;
using Xunit;
using static ReelRoulette.Core.Tests.RandomPickTest;

namespace ReelRoulette.Core.Tests;

/// <summary>The new files' share of the odds, and the Favor weights.</summary>
public sealed class RandomPickFavorTests
{
    private static readonly RandomPickOptions NewlyAdded = new() { Shuffle = false, SpreadByFolder = false, FavorNewlyAdded = true };
    private static readonly RandomPickOptions NewlyCreated = new() { Shuffle = false, SpreadByFolder = false, FavorNewlyCreated = true };
    private static readonly RandomPickOptions NewlyAddedAndCreated = new()
    {
        Shuffle = false,
        SpreadByFolder = false,
        FavorNewlyAdded = true,
        FavorNewlyCreated = true
    };

    private static readonly RandomPickOptions HigherRated = new() { Shuffle = false, SpreadByFolder = false, FavorHigherRated = true };

    private static double Newness(double days) => 1 - (0.75 * days / 14);

    [Fact]
    public void NewFiles_TakeTheirShareByNewness_AndEveryFileTheRestEvenly()
    {
        var items = new[]
        {
            Item("today", "/m/today.mp4", added: Now),
            Item("week", "/m/week.mp4", added: Now.AddDays(-7)),
            Item("old", "/m/old.mp4", added: Now.AddDays(-30)),
            Item("undated", "/m/undated.mp4")
        };

        var odds = Odds(new RandomPickMemory(), items, NewlyAdded);

        var newTotal = 1 + Newness(7);
        AssertOdds(
            odds,
            ("today", (0.8 / 4) + (0.2 / newTotal)),
            ("week", (0.8 / 4) + (0.2 * Newness(7) / newTotal)),
            ("old", 0.8 / 4),
            ("undated", 0.8 / 4));
        Assert.Equal(0.2 + (0.8 * 2 / 4), odds["today"] + odds["week"], Precision);
    }

    [Fact]
    public void ANewFile_IsFourTimesAsLikelyToday_AsAt14Days()
    {
        var items = new[]
        {
            Item("today", "/m/today.mp4", added: Now),
            Item("edge", "/m/edge.mp4", added: Now.AddDays(-14)),
            Item("old", "/m/old.mp4", added: Now.AddDays(-14).AddTicks(-1))
        };

        var odds = Odds(new RandomPickMemory(), items, NewlyAdded);

        AssertOdds(odds, ("today", (0.8 / 3) + (0.2 / 1.25)), ("edge", (0.8 / 3) + (0.2 * 0.25 / 1.25)), ("old", 0.8 / 3));
        Assert.Equal(4, (odds["today"] - (0.8 / 3)) / (odds["edge"] - (0.8 / 3)), Precision);
    }

    [Theory]
    [InlineData("added", "a", 3.0)]
    [InlineData("created", "c", 2.0)]
    public void OneNewnessOption_UsesItsOwnDate(string option, string newId, double ageDays)
    {
        var options = option == "added" ? NewlyAdded : NewlyCreated;
        var items = new[]
        {
            Item("a", "/m/a.mp4", added: Now.AddDays(-3), created: Now.AddDays(-30)),
            Item("c", "/m/c.mp4", added: Now.AddDays(-20), created: Now.AddDays(-2)),
            Item("both", "/m/both.mp4", added: Now.AddDays(-1), created: Now.AddDays(-1)),
            Item("x", "/m/x.mp4")
        };

        var odds = Odds(new RandomPickMemory(), items, options);

        var newTotal = Newness(ageDays) + Newness(1);
        var oldId = newId == "a" ? "c" : "a";
        AssertOdds(
            odds,
            (newId, 0.2 + (0.2 * Newness(ageDays) / newTotal)),
            ("both", 0.2 + (0.2 * Newness(1) / newTotal)),
            (oldId, 0.2),
            ("x", 0.2));
    }

    [Fact]
    public void BothNewnessOptions_UseTheLaterDate_OrTheOneThereIs()
    {
        var items = new[]
        {
            Item("later-created", "/m/a.mp4", added: Now.AddDays(-20), created: Now.AddDays(-2)),
            Item("later-added", "/m/b.mp4", added: Now.AddDays(-4), created: Now.AddDays(-30)),
            Item("created-only", "/m/c.mp4", created: Now.AddDays(-6)),
            Item("old", "/m/d.mp4", added: Now.AddDays(-15), created: Now.AddDays(-40))
        };

        var odds = Odds(new RandomPickMemory(), items, NewlyAddedAndCreated);

        var newTotal = Newness(2) + Newness(4) + Newness(6);
        AssertOdds(
            odds,
            ("later-created", 0.2 + (0.2 * Newness(2) / newTotal)),
            ("later-added", 0.2 + (0.2 * Newness(4) / newTotal)),
            ("created-only", 0.2 + (0.2 * Newness(6) / newTotal)),
            ("old", 0.2));
    }

    [Fact]
    public void FutureAndMissingDates_StayOutOfTheNewFiles()
    {
        var items = new[]
        {
            Item("future", "/m/future.mp4", added: Now.AddTicks(1)),
            Item("missing", "/m/missing.mp4", created: Now),
            Item("new", "/m/new.mp4", added: Now)
        };

        AssertOdds(Odds(new RandomPickMemory(), items, NewlyAdded), ("future", 0.8 / 3), ("missing", 0.8 / 3), ("new", (0.8 / 3) + 0.2));
    }

    [Fact]
    public void WithNoNewFileLeftToPick_ThePickIsAsUsual()
    {
        var options = new RandomPickOptions { Shuffle = true, SpreadByFolder = false, FavorNewlyAdded = true };
        var items = new[]
        {
            Item("new", "/m/new.mp4", added: Now),
            Item("b", "/m/b.mp4", added: Now.AddDays(-60)),
            Item("c", "/m/c.mp4"),
            Item("d", "/m/d.mp4")
        };
        AssertOdds(Odds(new RandomPickMemory(), items[1..], options), ("b", 1 / 3.0), ("c", 1 / 3.0), ("d", 1 / 3.0));

        var memory = new RandomPickMemory();
        PickId(memory, items, options, "new");

        AssertOdds(Odds(memory, items, options), ("new", 0), ("b", 1 / 3.0), ("c", 1 / 3.0), ("d", 1 / 3.0));
    }

    [Fact]
    public void FolderSpread_AppliesToTheNewFiles()
    {
        var options = new RandomPickOptions { Shuffle = false, SpreadByFolder = true, FavorNewlyAdded = true };
        var items = new[]
        {
            Item("a-new", "/a/new.mp4", added: Now),
            Item("a-old", "/a/old.mp4"),
            Item("b-new", "/b/new.mp4", added: Now),
            Item("b-old", "/b/old.mp4"),
            Item("c-old", "/c/old.mp4")
        };
        var memory = new RandomPickMemory();
        PickId(memory, items, options, "a-old");

        AssertOdds(Odds(memory, items, options), ("a-new", 0), ("a-old", 0), ("b-new", (0.8 / 3) + 0.2), ("b-old", 0.8 / 3), ("c-old", 0.8 / 3));
    }

    [Theory]
    [InlineData(10, 4.0)]
    [InlineData(8, 2.56)]
    [InlineData(6, 1.44)]
    [InlineData(4, 0.64)]
    [InlineData(2, 0.16)]
    [InlineData(1, 0.04)]
    [InlineData(5, 1.0)]
    public void HigherRated_WeighsByTheSquareOfTheStarsOver2Point5_AgainstAnUnratedFile(int halfStars, double weight)
    {
        var items = new[] { Item("rated", "/m/rated.mp4", rating: halfStars), Item("unrated", "/m/unrated.mp4") };

        AssertOdds(Odds(new RandomPickMemory(), items, HigherRated), ("rated", weight / (weight + 1)), ("unrated", 1 / (weight + 1)));
    }

    [Fact]
    public void TheWeights_Multiply_AndTheNewFilesShareGoesByWeightTimesNewness()
    {
        var options = new RandomPickOptions
        {
            Shuffle = false,
            SpreadByFolder = false,
            FavorLessPlayed = true,
            FavorHigherRated = true,
            FavorNewlyAdded = true
        };
        var items = new[]
        {
            // Never played and 5 stars: 1.4 × 4. New today.
            Item("top", "/m/top.mp4", rating: 10, added: Now),
            // One play 15 days ago and unrated: 0.7. New 7 days ago.
            Item("half", "/m/half.mp4", playCount: 1, lastPlayed: Now.AddDays(-15), added: Now.AddDays(-7)),
            // Floored at 0.05 and 2 stars: 0.05 × 0.64.
            Item("heavy", "/m/heavy.mp4", playCount: 1_000_000, lastPlayed: Now, rating: 4)
        };

        var odds = Odds(new RandomPickMemory(), items, options);

        double[] weights = [1.4 * 4, 0.7, 0.05 * 0.64];
        var total = weights.Sum();
        var newTotal = weights[0] + (weights[1] * Newness(7));
        AssertOdds(
            odds,
            ("top", (0.8 * weights[0] / total) + (0.2 * weights[0] / newTotal)),
            ("half", (0.8 * weights[1] / total) + (0.2 * weights[1] * Newness(7) / newTotal)),
            ("heavy", 0.8 * weights[2] / total));
    }
}
