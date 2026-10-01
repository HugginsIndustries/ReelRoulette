using System.Text.Json;
using ReelRoulette.Core.Tags;
using Xunit;

namespace ReelRoulette.Core.Tests;

public class TagNameComparerTests
{
    [Fact]
    public void Sort_ReproducesSharedFixtureOrder()
    {
        var expected = LoadFixture();

        var reversed = expected.AsEnumerable().Reverse().ToList();
        reversed.Sort(TagNameComparer.Instance);
        Assert.Equal(expected, reversed);

        var shuffled = expected.OrderBy(_ => 0).ToList();
        var random = new Random(1234);
        for (var i = shuffled.Count - 1; i > 0; i--)
        {
            var j = random.Next(i + 1);
            (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
        }

        Assert.Equal(expected, shuffled.OrderBy(name => name, TagNameComparer.Instance).ToList());
    }

    private static List<string> LoadFixture()
    {
        var path = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..",
            "..",
            "..",
            "..",
            "..",
            "..",
            "shared",
            "fixtures",
            "tag-name-order.json"));
        return JsonSerializer.Deserialize<List<string>>(File.ReadAllText(path)) ?? [];
    }
}
