using ReelRoulette.Core.Randomization;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class RandomSelectionEngineCoreTests
{
    [Fact]
    public void SmartShuffle_PlaysEveryEligibleItemOnceBeforeRepeating()
    {
        var items = Enumerable.Range(0, 25).Select(i => Item($"id-{i:D2}", $"/media/{i % 4}/clip-{i}.mp4")).ToList();
        var state = new RandomizationRuntimeStateCore();
        var rng = new Random(11);

        for (var cycle = 0; cycle < 3; cycle++)
        {
            var picked = Pick(state, RandomizationModeValue.SmartShuffle, items, rng, items.Count);
            Assert.Equal(items.Select(item => item.Id).Order(StringComparer.Ordinal), picked.Order(StringComparer.Ordinal));
        }
    }

    [Fact]
    public void SmartShuffle_RebuildsItsBagWhenTheEligibleSetChanges()
    {
        var items = Enumerable.Range(0, 10).Select(i => Item($"id-{i}", $"/media/clip-{i}.mp4")).ToList();
        var state = new RandomizationRuntimeStateCore();
        var rng = new Random(5);
        var played = Pick(state, RandomizationModeValue.SmartShuffle, items, rng, 4);

        var removed = items.First(item => !played.Contains(item.Id));
        var changed = items.Where(item => item != removed).Append(Item("id-new", "/media/new.mp4"))
            .OrderBy(item => item.Id, StringComparer.Ordinal)
            .ToList();
        var next = Pick(state, RandomizationModeValue.SmartShuffle, changed, rng, changed.Count);

        Assert.Equal(changed.Select(item => item.Id).Order(StringComparer.Ordinal), next.Order(StringComparer.Ordinal));
        Assert.DoesNotContain(removed.Id, next);
    }

    [Fact]
    public void SmartShuffle_KeepsItsCycleWhenOnlyPathsAndPlayStatsChange()
    {
        var items = Enumerable.Range(0, 10).Select(i => Item($"id-{i}", $"/media/clip-{i}.mp4")).ToList();
        var state = new RandomizationRuntimeStateCore();
        var rng = new Random(3);
        var played = Pick(state, RandomizationModeValue.SmartShuffle, items, rng, 4);

        var moved = items
            .Select(item => Item(item.Id, "/moved/" + item.Id + ".mp4", playCount: 7, lastPlayed: DateTime.UtcNow))
            .ToList();
        Assert.Equal(
            RandomSelectionEngineCore.ComputeEligibleSignature(items),
            RandomSelectionEngineCore.ComputeEligibleSignature(moved));

        var rest = new List<RandomizationItem>();
        for (var i = 0; i < 6; i++)
        {
            rest.Add(RandomSelectionEngineCore.SelectItem(state, RandomizationModeValue.SmartShuffle, moved, rng)!);
        }

        Assert.Equal(
            items.Select(item => item.Id).Except(played).Order(StringComparer.Ordinal),
            rest.Select(item => item.Id).Order(StringComparer.Ordinal));
        Assert.All(rest, item => Assert.StartsWith("/moved/", item.FullPath, StringComparison.Ordinal));
    }

    [Fact]
    public void Signature_CoversTheIdsInOrder_AndNotPathsOrPlayStats()
    {
        var items = new[] { Item("a", "/one/a.mp4"), Item("b", "/one/b.mp4") };
        var signature = RandomSelectionEngineCore.ComputeEligibleSignature(items);

        Assert.Equal(signature, RandomSelectionEngineCore.ComputeEligibleSignature([Item("a", "/two/A.mp4", playCount: 3), Item("b", "/b.mp4")]));
        Assert.NotEqual(signature, RandomSelectionEngineCore.ComputeEligibleSignature([Item("a", "/one/a.mp4")]));
        Assert.NotEqual(signature, RandomSelectionEngineCore.ComputeEligibleSignature([Item("a", "/one/a.mp4"), Item("c", "/one/b.mp4")]));
        Assert.NotEqual(signature, RandomSelectionEngineCore.ComputeEligibleSignature([.. items, Item("c", "/one/c.mp4")]));
        Assert.Equal("empty", RandomSelectionEngineCore.ComputeEligibleSignature([]));
    }

    [Fact]
    public void PureRandom_PicksTheItemAtTheDrawnIndex()
    {
        var items = new[] { Item("a", "/m/a.mp4"), Item("b", "/m/b.mp4"), Item("c", "/m/c.mp4") };
        var rng = new ScriptedRandom(ints: [2, 0]);
        var state = new RandomizationRuntimeStateCore();

        Assert.Equal("c", RandomSelectionEngineCore.SelectItem(state, RandomizationModeValue.PureRandom, items, rng)!.Id);
        Assert.Equal("a", RandomSelectionEngineCore.SelectItem(state, RandomizationModeValue.PureRandom, items, rng)!.Id);
    }

    [Theory]
    // Weights: never played 0.6 + 0.8 = 1.4; one play 15 days ago 0.3 + 0.4 = 0.7;
    // three plays, played now 0.15 + 0.04 = 0.19; heavy is floored at 0.05. Total 2.34.
    [InlineData(0.597, "never")]
    [InlineData(0.600, "half")]
    [InlineData(0.896, "half")]
    [InlineData(0.899, "recent")]
    [InlineData(0.977, "recent")]
    [InlineData(0.980, "heavy")]
    public void WeightedRandom_RollsOverPlayCountAndRecencyWeights(double roll, string expected)
    {
        var now = DateTime.UtcNow;
        var items = new[]
        {
            Item("never", "/m/never.mp4"),
            Item("half", "/m/half.mp4", playCount: 1, lastPlayed: now.AddDays(-15)),
            Item("recent", "/m/recent.mp4", playCount: 3, lastPlayed: now.AddDays(1)),
            Item("heavy", "/m/heavy.mp4", playCount: 1_000_000, lastPlayed: now.AddDays(1))
        };

        var picked = RandomSelectionEngineCore.SelectItem(
            new RandomizationRuntimeStateCore(),
            RandomizationModeValue.WeightedRandom,
            items,
            new ScriptedRandom(doubles: [roll]));

        Assert.Equal(expected, picked!.Id);
    }

    [Theory]
    // After a pick from folder a, each item there weighs 1 / (1 + 1.5) = 0.4 and b1 weighs 1. Total 1.8.
    [InlineData(0.221, "a1")]
    [InlineData(0.223, "a2")]
    [InlineData(0.443, "a2")]
    [InlineData(0.446, "b1")]
    public void SpreadMode_WeighsDownFoldersPickedRecently_IgnoringCase(double roll, string expected)
    {
        var items = new[] { Item("a1", "/a/a1.mp4"), Item("a2", "/A/a2.mp4"), Item("b1", "/b/b1.mp4") };
        Assert.Equal(expected, PickAfterFirstFromFolderA(RandomizationModeValue.SpreadMode, items, roll));
    }

    [Theory]
    // Never played 1.4 * 0.4 = 0.56 for both items in folder a, and b1 played once 15 days ago 0.7. Total 1.82.
    [InlineData(0.306, "a1")]
    [InlineData(0.309, "a2")]
    [InlineData(0.614, "a2")]
    [InlineData(0.617, "b1")]
    public void WeightedWithSpread_MultipliesPlayWeightsBySpread(double roll, string expected)
    {
        var items = new[]
        {
            Item("a1", "/a/a1.mp4"),
            Item("a2", "/a/a2.mp4"),
            Item("b1", "/b/b1.mp4", playCount: 1, lastPlayed: DateTime.UtcNow.AddDays(-15))
        };
        Assert.Equal(expected, PickAfterFirstFromFolderA(RandomizationModeValue.WeightedWithSpread, items, roll));
    }

    private static string PickAfterFirstFromFolderA(RandomizationModeValue mode, RandomizationItem[] items, double roll)
    {
        var state = new RandomizationRuntimeStateCore();
        var rng = new ScriptedRandom(doubles: [0.0, roll]);
        Assert.Equal("a1", RandomSelectionEngineCore.SelectItem(state, mode, items, rng)!.Id);
        return RandomSelectionEngineCore.SelectItem(state, mode, items, rng)!.Id;
    }

    private static List<string> Pick(
        RandomizationRuntimeStateCore state,
        RandomizationModeValue mode,
        IReadOnlyList<RandomizationItem> items,
        Random rng,
        int count)
    {
        var picked = new List<string>();
        for (var i = 0; i < count; i++)
        {
            picked.Add(RandomSelectionEngineCore.SelectItem(state, mode, items, rng)!.Id);
        }

        return picked;
    }

    private static RandomizationItem Item(string id, string path, int playCount = 0, DateTime? lastPlayed = null) => new()
    {
        Id = id,
        FullPath = path,
        PlayCount = playCount,
        LastPlayedUtc = lastPlayed
    };

    /// <summary>Returns the queued values in order, so a test chooses each draw.</summary>
    private sealed class ScriptedRandom(IEnumerable<double>? doubles = null, IEnumerable<int>? ints = null) : Random
    {
        private readonly Queue<double> _doubles = new(doubles ?? []);
        private readonly Queue<int> _ints = new(ints ?? []);

        public override double NextDouble() => _doubles.Dequeue();

        public override int Next(int maxValue) => _ints.Dequeue();
    }
}
