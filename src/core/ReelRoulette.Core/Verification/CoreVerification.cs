using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Randomization;
using ReelRoulette.Core.Tags;

namespace ReelRoulette.Core.Verification;

public sealed class VerificationIssue
{
    public required string Name { get; init; }
    public required string Message { get; init; }
}

public sealed class VerificationResult
{
    public List<VerificationIssue> Issues { get; } = new();
    public bool Success => Issues.Count == 0;
}

public static class CoreVerification
{
    public static VerificationResult RunAll()
    {
        var result = new VerificationResult();
        VerifyRandomization(result);
        VerifyFilterEvaluation(result);
        VerifyTagOperations(result);
        VerifyDtoMappingRules(result);
        return result;
    }

    private static void VerifyRandomization(VerificationResult result)
    {
        var rng = new Random(7);
        var state = new RandomizationRuntimeStateCore();
        var items = new List<RandomizationItem>
        {
            new() { FullPath = @"C:\one.mp4" },
            new() { FullPath = @"C:\two.mp4" }
        };
        var selected = RandomSelectionEngineCore.SelectPath(state, RandomizationModeValue.SmartShuffle, items, rng);
        if (string.IsNullOrWhiteSpace(selected))
        {
            result.Issues.Add(new VerificationIssue
            {
                Name = "Randomization",
                Message = "Expected SmartShuffle selection to return a path."
            });
        }
    }

    private static void VerifyFilterEvaluation(VerificationResult result)
    {
        var builder = new FilterSetBuilder();
        var request = new FilterSetRequest
        {
            Sources = new List<FilterSource> { new() { Id = "a", IsEnabled = true } },
            Items = new List<FilterItem>
            {
                new() { Key = "1", SourceId = "a", FullPath = "x", Tags = new List<string> { "tagA" } },
                new() { Key = "2", SourceId = "a", FullPath = "y", Tags = new List<string> { "tagB" } }
            }
        };
        var state = new FilterStateModel { SelectedTags = new List<string> { "tagA" } };
        var eligible = builder.BuildEligibleSetWithoutFileCheck(state, request);
        if (eligible.Count != 1 || eligible[0].Key != "1")
        {
            result.Issues.Add(new VerificationIssue
            {
                Name = "FilterEvaluation",
                Message = "Expected filter to keep only tagA item."
            });
        }
    }

    private static void VerifyTagOperations(VerificationResult result)
    {
        var service = new TagMutationService();
        var index = new CoreLibraryIndex
        {
            Tags = new List<CoreTag> { new() { Name = "old", CategoryId = "cat" } },
            Items = new List<CoreLibraryItem> { new() { Tags = new List<string> { "old" } } }
        };
        service.RenameTag(index, "old", "new");
        if (index.Items[0].Tags.All(t => !string.Equals(t, "new", StringComparison.Ordinal)))
        {
            result.Issues.Add(new VerificationIssue
            {
                Name = "TagOperations",
                Message = "Expected renamed tag to be propagated to items."
            });
        }
    }

    // Placeholder for shape/compat assertions as mapping contracts evolve.
    private static void VerifyDtoMappingRules(VerificationResult result)
    {
        var mappingSmoke = new CoreFilterPreset
        {
            Name = "PresetA",
            FilterState = new CoreFilterState
            {
                SelectedTags = new List<string> { "x" },
                ExcludedTags = new List<string>()
            }
        };
        if (string.IsNullOrWhiteSpace(mappingSmoke.Name))
        {
            result.Issues.Add(new VerificationIssue
            {
                Name = "DtoMappingRules",
                Message = "Preset name should not be empty."
            });
        }
    }
}
