using System;
using System.Collections.Generic;
using System.Linq;
using ReelRoulette.Core.Randomization;

namespace ReelRoulette
{
    /// <summary>
    /// Desktop adapter over core random selection logic.
    /// </summary>
    public static class RandomSelectionEngine
    {
        public static string ComputeEligibleSignature(IReadOnlyList<LibraryItem> eligibleItems)
        {
            return RandomSelectionEngineCore.ComputeEligibleSignature(ToCoreItems(eligibleItems));
        }

        public static void EnsureStateForEligibleSet(
            RandomizationRuntimeState state,
            RandomizationMode mode,
            IReadOnlyList<LibraryItem> eligibleItems,
            Random rng)
        {
            RandomSelectionEngineCore.EnsureStateForEligibleSet(
                state.CoreState,
                ToCoreMode(mode),
                ToCoreItems(eligibleItems),
                rng);
        }

        public static void RebuildState(
            RandomizationRuntimeState state,
            RandomizationMode mode,
            IReadOnlyList<LibraryItem> eligibleItems,
            Random rng)
        {
            RandomSelectionEngineCore.RebuildState(
                state.CoreState,
                ToCoreMode(mode),
                ToCoreItems(eligibleItems),
                rng);
        }

        public static string? SelectPath(
            RandomizationRuntimeState state,
            RandomizationMode mode,
            IReadOnlyList<LibraryItem> eligibleItems,
            Random rng)
        {
            return RandomSelectionEngineCore.SelectPath(
                state.CoreState,
                ToCoreMode(mode),
                ToCoreItems(eligibleItems),
                rng);
        }

        private static List<RandomizationItem> ToCoreItems(IReadOnlyList<LibraryItem> eligibleItems)
        {
            return eligibleItems
                .Select(item => new RandomizationItem
                {
                    FullPath = item.FullPath,
                    PlayCount = item.PlayCount,
                    LastPlayedUtc = item.LastPlayedUtc
                })
                .ToList();
        }

        private static RandomizationModeValue ToCoreMode(RandomizationMode mode)
        {
            return (RandomizationModeValue)(int)mode;
        }
    }

    /// <summary>
    /// Runtime-only randomization state; intentionally not persisted.
    /// </summary>
    public sealed class RandomizationRuntimeState
    {
        internal RandomizationRuntimeStateCore CoreState { get; } = new();
    }
}
