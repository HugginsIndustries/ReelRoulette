using ReelRoulette.Core.Randomization;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>Builders and helpers for the random pick engine's tests, at a fixed time.</summary>
internal static class RandomPickTest
{
    public const int Precision = 12;

    public static readonly DateTime Now = new(2026, 6, 1, 12, 0, 0, DateTimeKind.Utc);

    /// <summary>Every option off: pure random.</summary>
    public static readonly RandomPickOptions AllOff = new() { Shuffle = false, SpreadByFolder = false };

    public static readonly RandomPickOptions ShuffleOnly = new() { Shuffle = true, SpreadByFolder = false };

    public static readonly RandomPickOptions FolderSpreadOnly = new() { Shuffle = false, SpreadByFolder = true };

    public static RandomizationItem Item(
        string id,
        string path,
        int playCount = 0,
        DateTime? lastPlayed = null,
        DateTime? added = null,
        DateTime? created = null,
        int? rating = null,
        params RandomizationTag[] tags) => new()
        {
            Id = id,
            FullPath = path,
            PlayCount = playCount,
            LastPlayedUtc = lastPlayed,
            DateAddedUtc = added,
            DateCreatedUtc = created,
            RatingHalfStars = rating,
            Tags = tags
        };

    public static RandomizationTag Tag(string key, string categoryId = "general") => new(key, categoryId);

    /// <summary>Each file's odds for the next pick, by id.</summary>
    public static Dictionary<string, double> Odds(
        RandomPickMemory memory,
        IReadOnlyList<RandomizationItem> items,
        RandomPickOptions options,
        DateTime? now = null)
    {
        var odds = RandomSelectionEngineCore.ComputeOdds(memory, items, options, now ?? Now).Odds;
        return items.Select((item, i) => (item.Id, odds[i])).ToDictionary(pair => pair.Id, pair => pair.Item2, StringComparer.Ordinal);
    }

    /// <summary>Picks the file with this id, with a roll in the middle of its odds, and checks that it was picked.</summary>
    public static RandomPickResult PickId(
        RandomPickMemory memory,
        IReadOnlyList<RandomizationItem> items,
        RandomPickOptions options,
        string id,
        DateTime? now = null)
    {
        var odds = RandomSelectionEngineCore.ComputeOdds(memory, items, options, now ?? Now).Odds;
        var index = items.Select(item => item.Id).ToList().IndexOf(id);
        Assert.True(odds[index] > 0, $"Expected {id} to have odds.");
        var roll = (odds.Take(index).Sum() + (odds[index] / 2)) / odds.Sum();
        var result = RandomSelectionEngineCore.SelectItem(memory, items, options, now ?? Now, new ScriptedRandom(roll));
        Assert.Equal(id, result!.Item.Id);
        return result;
    }

    public static void PickIds(
        RandomPickMemory memory,
        IReadOnlyList<RandomizationItem> items,
        RandomPickOptions options,
        params string[] ids)
    {
        foreach (var id in ids)
        {
            PickId(memory, items, options, id);
        }
    }

    public static void AssertOdds(IReadOnlyDictionary<string, double> odds, params (string Id, double Odds)[] expected)
    {
        Assert.Equal(expected.Length, odds.Count);
        foreach (var (id, value) in expected)
        {
            Assert.True(odds.ContainsKey(id), $"Expected odds for {id}.");
            Assert.Equal(value, odds[id], Precision);
        }
    }
}

/// <summary>Returns the queued rolls in order, so a test chooses each draw, and fails on a draw it didn't queue.</summary>
internal sealed class ScriptedRandom(params double[] rolls) : Random
{
    private readonly Queue<double> _rolls = new(rolls);

    public override double NextDouble() => _rolls.Dequeue();
}
