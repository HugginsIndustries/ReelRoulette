using ReelRoulette.Core.Randomization;
using Xunit;
using static ReelRoulette.Core.Tests.RandomPickTest;

namespace ReelRoulette.Core.Tests;

/// <summary>The cycle numbers, and the eligible set's signature that keys the cached folders and tags.</summary>
public sealed class RandomPickCycleTests
{
    private static readonly RandomizationItem[] Four =
    [
        Item("a", "/m/a.mp4"),
        Item("b", "/m/b.mp4"),
        Item("c", "/m/c.mp4"),
        Item("d", "/m/d.mp4")
    ];

    [Fact]
    public void EachPick_CountsThePickedAndRemainingFiles_AndANewCycleStartsAtOne()
    {
        var memory = new RandomPickMemory();
        var random = new Random(3);
        var picked = new List<int>();

        for (var i = 0; i < 10; i++)
        {
            var cycle = RandomSelectionEngineCore.SelectItem(memory, Four, ShuffleOnly, Now, random)!.Cycle;
            Assert.Equal(4, cycle.Eligible);
            Assert.Equal(cycle.Eligible, cycle.Picked + cycle.Remaining);
            Assert.Equal(cycle, RandomSelectionEngineCore.GetCycle(memory, Four, ShuffleOnly, Now));
            picked.Add(cycle.Picked);
        }

        Assert.Equal([1, 2, 3, 4, 1, 2, 3, 4, 1, 2], picked);
    }

    [Fact]
    public void PicksOfFilesOutsideTheSet_DoNotCount()
    {
        var memory = new RandomPickMemory();
        PickIds(memory, [.. Four, Item("z", "/m/z.mp4")], ShuffleOnly, "z", "a");

        Assert.Equal(new RandomPickCycle(1, 4), RandomSelectionEngineCore.GetCycle(memory, Four, ShuffleOnly, Now));
        Assert.Equal(new RandomPickCycle(2, 4), PickId(memory, Four, ShuffleOnly, "b").Cycle);
    }

    [Fact]
    public void ARepeatWithShuffleOff_CountsOnce()
    {
        var memory = new RandomPickMemory();

        Assert.Equal(1, PickId(memory, Four, AllOff, "a").Cycle.Picked);
        Assert.Equal(1, PickId(memory, Four, AllOff, "a").Cycle.Picked);
        Assert.Equal(new RandomPickCycle(2, 4), PickId(memory, Four, AllOff, "b").Cycle);
        Assert.Equal(2, PickId(memory, Four, AllOff, "a").Cycle.Remaining);
    }

    [Fact]
    public void GetCycle_CountsOnlyPicksWithinTheWindow_AndChangesNothing()
    {
        var thirtyDays = new RandomPickOptions { Shuffle = true, SpreadByFolder = false, RememberPlaysForDays = 30 };
        var sevenDays = new RandomPickOptions { Shuffle = true, SpreadByFolder = false, RememberPlaysForDays = 7 };
        var memory = new RandomPickMemory();
        PickId(memory, Four, thirtyDays, "a", Now.AddDays(-10));
        PickId(memory, Four, thirtyDays, "b");

        Assert.Equal(new RandomPickCycle(1, 4), RandomSelectionEngineCore.GetCycle(memory, Four, sevenDays, Now));
        Assert.Equal(2, memory.Picks.Count);
        Assert.Equal(new RandomPickCycle(2, 4), RandomSelectionEngineCore.GetCycle(memory, Four, thirtyDays, Now));
    }

    [Fact]
    public void Signature_CoversIdsPathsAndTagsWithTheirCategories_AndNotPlayStatsDatesOrRating()
    {
        RandomizationItem[] items = [Item("a", "/one/a.mp4", tags: Tag("red", "colors")), Item("b", "/one/b.mp4")];
        var signature = RandomSelectionEngineCore.ComputeEligibleSignature(items);

        Assert.Equal(signature, RandomSelectionEngineCore.ComputeEligibleSignature(
        [
            Item("a", "/one/a.mp4", playCount: 3, lastPlayed: Now, added: Now, created: Now, rating: 8, tags: Tag("red", "COLORS")),
            Item("b", "/one/b.mp4", rating: 2)
        ]));
        Assert.NotEqual(signature, RandomSelectionEngineCore.ComputeEligibleSignature([items[0]]));
        Assert.NotEqual(signature, RandomSelectionEngineCore.ComputeEligibleSignature([items[0], Item("c", "/one/b.mp4")]));
        Assert.NotEqual(signature, RandomSelectionEngineCore.ComputeEligibleSignature([items[0], Item("b", "/two/b.mp4")]));
        Assert.NotEqual(signature, RandomSelectionEngineCore.ComputeEligibleSignature([items[1], items[0]]));
        Assert.NotEqual(signature, RandomSelectionEngineCore.ComputeEligibleSignature([items[0], Item("b", "/one/b.mp4", tags: Tag("red", "colors"))]));
        Assert.NotEqual(signature, RandomSelectionEngineCore.ComputeEligibleSignature([Item("a", "/one/a.mp4", tags: Tag("blue", "colors")), items[1]]));
        Assert.NotEqual(signature, RandomSelectionEngineCore.ComputeEligibleSignature([Item("a", "/one/a.mp4", tags: Tag("red", "sizes")), items[1]]));
    }
}
