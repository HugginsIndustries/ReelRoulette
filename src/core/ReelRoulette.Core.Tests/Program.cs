using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Randomization;
using ReelRoulette.Core.Tags;

RunRandomizationTests();
RunFilterTests();
RunTagMutationTests();

Console.WriteLine("All core tests passed.");

static void RunRandomizationTests()
{
    var rng = new Random(1234);
    var state = new RandomizationRuntimeStateCore();
    var items = new List<RandomizationItem>
    {
        new() { FullPath = @"C:\A\one.mp4", PlayCount = 0 },
        new() { FullPath = @"C:\B\two.mp4", PlayCount = 4 },
        new() { FullPath = @"C:\C\three.mp4", PlayCount = 2 }
    };

    var first = RandomSelectionEngineCore.SelectPath(state, RandomizationModeValue.SmartShuffle, items, rng);
    var second = RandomSelectionEngineCore.SelectPath(state, RandomizationModeValue.SmartShuffle, items, rng);
    Assert(first != null && second != null, "SmartShuffle should return values for non-empty item set.");
}

static void RunFilterTests()
{
    var builder = new FilterSetBuilder();
    var filterState = new FilterStateModel
    {
        ExcludeBlacklisted = true,
        SelectedTags = new List<string> { "night" },
        TagMatchMode = TagMatchModeValue.And
    };
    var request = new FilterSetRequest
    {
        Sources = new List<FilterSource>
        {
            new() { Id = "s1", IsEnabled = true }
        },
        Items = new List<FilterItem>
        {
            new() { Key = "1", SourceId = "s1", FullPath = "a", Tags = new List<string> { "night" } },
            new() { Key = "2", SourceId = "s1", FullPath = "b", Tags = new List<string> { "day" } }
        }
    };

    var result = builder.BuildEligibleSetWithoutFileCheck(filterState, request);
    Assert(result.Count == 1 && result[0].Key == "1", "Tag inclusion should keep matching item only.");
}

static void RunTagMutationTests()
{
    var service = new TagMutationService();
    var index = new CoreLibraryIndex
    {
        Categories = new List<CoreTagCategory> { new() { Id = "c1", Name = "Genre" } },
        Tags = new List<CoreTag> { new() { Name = "old", CategoryId = "c1" } },
        Items = new List<CoreLibraryItem> { new() { Tags = new List<string> { "old" } } }
    };

    service.RenameTag(index, "old", "new");
    Assert(index.Tags![0].Name == "new", "RenameTag should update tag definition.");
    Assert(index.Items[0].Tags.Contains("new"), "RenameTag should update item tags.");
}

static void Assert(bool condition, string message)
{
    if (!condition)
        throw new InvalidOperationException(message);
}
