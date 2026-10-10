using System.Text.Json;
using System.Text.Json.Nodes;
using ReelRoulette;
using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Storage;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

/// <summary>
/// The Favorites and Blacklisted filter modes as the desktop reads and writes them, locked to the fixtures the server
/// and the WebUI also read.
/// </summary>
public sealed class FilterModeJsonTests : IDisposable
{
    private static readonly string[] WrittenFields = ["favoritesMode", "favoritesOnly", "blacklistedMode", "excludeBlacklisted"];

    private readonly string _tempDir = Path.Combine(Path.GetTempPath(), "reelroulette-filter-mode-json-tests", Guid.NewGuid().ToString("N"));

    public FilterModeJsonTests()
    {
        Directory.CreateDirectory(_tempDir);
    }

    public static TheoryData<string, string, string, string> ResolutionCases()
    {
        var data = new TheoryData<string, string, string, string>();
        using var fixture = JsonDocument.Parse(File.ReadAllText(FixturePath("filter-mode-resolution.json")));
        foreach (var entry in fixture.RootElement.EnumerateArray())
        {
            data.Add(
                entry.GetProperty("name").GetString()!,
                entry.GetProperty("filter").GetRawText(),
                entry.GetProperty("favoritesMode").GetString()!,
                entry.GetProperty("blacklistedMode").GetString()!);
        }

        return data;
    }

    public static TheoryData<string, string, string, string> ProjectionCases()
    {
        var data = new TheoryData<string, string, string, string>();
        using var fixture = JsonDocument.Parse(File.ReadAllText(FixturePath("filter-mode-projection.json")));
        foreach (var entry in fixture.RootElement.EnumerateArray())
        {
            data.Add(
                entry.GetProperty("name").GetString()!,
                entry.GetProperty("favoritesMode").GetString()!,
                entry.GetProperty("blacklistedMode").GetString()!,
                entry.GetProperty("written").GetRawText());
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(ResolutionCases))]
    public void ReadFilter_ResolvesModesLikeTheSharedFixture(string name, string filterJson, string favoritesMode, string blacklistedMode)
    {
        // Presets loaded from the server are read this way.
        var filter = JsonSerializer.Deserialize<FilterState>(filterJson)!;

        Assert.True(Mode(favoritesMode) == filter.FavoritesMode, $"{name}: favorites expected {favoritesMode}, got {filter.FavoritesMode}");
        Assert.True(Mode(blacklistedMode) == filter.BlacklistedMode, $"{name}: blacklisted expected {blacklistedMode}, got {filter.BlacklistedMode}");
    }

    [Theory]
    [MemberData(nameof(ProjectionCases))]
    public void WrittenFilter_CarriesTheModesAndTheirProjection(string name, string favoritesMode, string blacklistedMode, string writtenJson)
    {
        var filter = new FilterState { FavoritesMode = Mode(favoritesMode), BlacklistedMode = Mode(blacklistedMode) };
        using var written = JsonDocument.Parse(writtenJson);

        // Random requests and the preset post write the filter with default options.
        var defaultJson = JsonSerializer.SerializeToElement(filter);
        AssertWritten($"{name} (default options)", written.RootElement, defaultJson);
        AssertReadsBack($"{name} (default options)", filter, JsonSerializer.Deserialize<FilterState>(defaultJson)!);

        // Library queries write it with the library item options.
        var libraryJson = JsonSerializer.SerializeToElement(filter, CoreServerApiClient.LibraryItemJsonOptions);
        AssertWritten($"{name} (library query)", written.RootElement, libraryJson);
        AssertReadsBack($"{name} (library query)", filter, JsonSerializer.Deserialize<FilterState>(libraryJson, CoreServerApiClient.LibraryItemJsonOptions)!);

        // desktop-settings.json keeps the saved filter.
        var settingsPath = Path.Combine(_tempDir, $"desktop-settings-{Guid.NewGuid():N}.json");
        CreateStorage(settingsPath).Save(new DesktopAppSettings { FilterState = filter });
        using (var saved = JsonDocument.Parse(File.ReadAllText(settingsPath)))
        {
            AssertWritten($"{name} (desktop settings)", written.RootElement, saved.RootElement.GetProperty("FilterState"));
        }

        var reload = CreateStorage(settingsPath).Load();
        AssertReadsBack($"{name} (desktop settings)", filter, Assert.IsType<FilterState>(reload.FilterState));
    }

    [Fact]
    public void DesktopWrittenFilter_MatchesTheCrossClientFixture()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(FixturePath("filter-state-written.json")));
        var expected = fixture.RootElement.GetProperty("desktop");

        // Preset posts write the filter with default options.
        var actual = JsonSerializer.SerializeToElement(WrittenFixtureFilter());

        Assert.True(JsonElement.DeepEquals(expected, actual), $"The desktop wrote {actual.GetRawText()}");
    }

    [Theory]
    [MemberData(nameof(ProjectionCases))]
    public void WebUiWrittenFilter_ReadsAsThatFilter(string name, string favoritesMode, string blacklistedMode, string writtenJson)
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(FixturePath("filter-state-written.json")));
        var webui = JsonNode.Parse(fixture.RootElement.GetProperty("webui").GetRawText())!.AsObject();
        foreach (var field in JsonNode.Parse(writtenJson)!.AsObject())
        {
            webui[field.Key] = field.Value?.DeepClone();
        }

        using var posted = JsonDocument.Parse(webui.ToJsonString());
        var read = LibraryPresetSelection.FilterStateFromServer(posted.RootElement);

        Assert.True(Mode(favoritesMode) == read.FavoritesMode, $"{name}: favorites read as {read.FavoritesMode}");
        Assert.True(Mode(blacklistedMode) == read.BlacklistedMode, $"{name}: blacklisted read as {read.BlacklistedMode}");

        var expected = WrittenFixtureFilter();
        expected.FavoritesMode = Mode(favoritesMode);
        expected.BlacklistedMode = Mode(blacklistedMode);
        Assert.True(LibraryPresetSelection.FiltersEqual(expected, read), $"{name}: read as {JsonSerializer.Serialize(read)}");
    }

    /// <summary>
    /// The filter in filter-state-written.json.
    /// </summary>
    private static FilterState WrittenFixtureFilter()
    {
        return new FilterState
        {
            FavoritesMode = FlagFilterModeValue.Excluded,
            BlacklistedMode = FlagFilterModeValue.Only,
            OnlyNeverPlayed = true,
            AudioFilter = AudioFilterMode.WithAudioOnly,
            MediaTypeFilter = MediaTypeFilter.VideosOnly,
            MinDuration = TimeSpan.FromSeconds(90),
            MaxDuration = TimeSpan.FromSeconds(5400),
            SelectedTags = ["Beach"],
            ExcludedTags = ["Spoiler"],
            CategoryLocalMatchModes = new Dictionary<string, TagMatchMode> { ["people"] = TagMatchMode.Or },
            GlobalMatchMode = false,
            IncludedSourceIds = ["source-1"],
            OnlyKnownDuration = false,
            OnlyKnownLoudness = false
        };
    }

    private static void AssertWritten(string name, JsonElement expected, JsonElement actual)
    {
        foreach (var field in WrittenFields)
        {
            var expectedValue = expected.GetProperty(field).GetRawText();
            Assert.True(actual.TryGetProperty(field, out var actualValue), $"{name}: {field} was not written");
            Assert.True(expectedValue == actualValue.GetRawText(), $"{name}: {field} expected {expectedValue}, got {actualValue.GetRawText()}");
        }
    }

    private static void AssertReadsBack(string name, FilterState expected, FilterState actual)
    {
        Assert.True(expected.FavoritesMode == actual.FavoritesMode, $"{name}: favorites read back as {actual.FavoritesMode}");
        Assert.True(expected.BlacklistedMode == actual.BlacklistedMode, $"{name}: blacklisted read back as {actual.BlacklistedMode}");
    }

    private static FlagFilterModeValue Mode(string name)
    {
        return FlagFilterModes.Parse(name) ?? throw new InvalidDataException($"Unknown mode '{name}' in the fixture.");
    }

    private static SettingsStorageService<DesktopAppSettings> CreateStorage(string settingsPath)
    {
        return new SettingsStorageService<DesktopAppSettings>(new JsonFileStorageOptions<DesktopAppSettings>
        {
            FilePathResolver = () => settingsPath,
            CreateDefault = () => new DesktopAppSettings(),
            SerializerOptions = new JsonSerializerOptions { WriteIndented = true }
        });
    }

    private static string FixturePath(string fileName)
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "shared", "fixtures", fileName);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new FileNotFoundException($"shared/fixtures/{fileName} was not found above the test output folder.");
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_tempDir))
            {
                Directory.Delete(_tempDir, recursive: true);
            }
        }
        catch
        {
            // Best-effort temp cleanup for tests.
        }
    }
}
