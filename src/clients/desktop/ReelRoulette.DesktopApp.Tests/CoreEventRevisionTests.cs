using System.Text.Json;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

/// <summary>
/// The revision rule locked to the fixture the WebUI event stream client also reads.
/// </summary>
public sealed class CoreEventRevisionTests
{
    public static TheoryData<string, string> Cases()
    {
        var data = new TheoryData<string, string>();
        using var fixture = JsonDocument.Parse(File.ReadAllText(FixturePath()));
        foreach (var entry in fixture.RootElement.EnumerateArray())
        {
            data.Add(entry.GetProperty("name").GetString()!, entry.GetRawText());
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void Next_MatchesTheSharedFixture(string name, string entryJson)
    {
        using var document = JsonDocument.Parse(entryJson);
        var entry = document.RootElement;
        var last = entry.GetProperty("lastRevision");
        long? lastRevision = last.ValueKind == JsonValueKind.Null ? null : last.GetInt64();

        var actual = CoreEventRevision.Next(
            lastRevision,
            entry.GetProperty("eventType").GetString(),
            entry.GetProperty("revision").GetInt64());

        var expected = entry.GetProperty("expected").GetInt64();
        Assert.True(expected == actual, $"{name}: expected {expected}, got {actual}");
    }

    private static string FixturePath()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "shared", "fixtures", "event-revision.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new FileNotFoundException("shared/fixtures/event-revision.json was not found above the test output folder.");
    }
}
