using System.Globalization;
using System.Text.Json;

namespace ReelRoulette.Core.Filtering;

/// <summary>A date range that rolls with the clock.</summary>
public enum FilterDateRangePreset
{
    Last7Days,
    Last30Days,
    Last90Days,
    ThisYear
}

/// <summary>
/// The days a date filter keeps: a preset or a custom range of whole days. A filter holds the choice, never
/// resolved dates, so a preset always means the days up to today.
/// </summary>
public sealed record FilterDateRange
{
    private const string DayFormat = "yyyy-MM-dd";

    private FilterDateRange()
    {
    }

    /// <summary>The preset, or null for a custom range.</summary>
    public FilterDateRangePreset? Preset { get; private init; }

    /// <summary>A custom range's first day, or null for a preset.</summary>
    public DateOnly? From { get; private init; }

    /// <summary>A custom range's last day, or null for a preset.</summary>
    public DateOnly? To { get; private init; }

    public static FilterDateRange Of(FilterDateRangePreset preset) => new() { Preset = preset };

    /// <summary>A custom range from its first to its last day, or null when it ends before it starts.</summary>
    public static FilterDateRange? Custom(DateOnly from, DateOnly to) => to < from ? null : new() { From = from, To = to };

    /// <summary>The preset's name in a filter state, such as <c>last7Days</c>.</summary>
    public static string PresetName(FilterDateRangePreset preset) => JsonNamingPolicy.CamelCase.ConvertName(preset.ToString());

    /// <summary>Reads a preset's name, ignoring case.</summary>
    public static bool TryParsePreset(string? name, out FilterDateRangePreset preset)
    {
        foreach (var candidate in Enum.GetValues<FilterDateRangePreset>())
        {
            if (string.Equals(name, PresetName(candidate), StringComparison.OrdinalIgnoreCase))
            {
                preset = candidate;
                return true;
            }
        }

        preset = default;
        return false;
    }

    /// <summary>Reads a custom range's day, written YYYY-MM-DD.</summary>
    public static bool TryParseDay(string? text, out DateOnly day) =>
        DateOnly.TryParseExact(text, DayFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out day);

    /// <summary>
    /// The range as UTC ticks, from the start of its first day to the start of the day after its last, in the
    /// clock's time zone: Last N days is today and the N − 1 days before it, and This year is 1 January to
    /// 31 December. Each day starts at its own offset, so a range stays whole days across a daylight saving change.
    /// </summary>
    public (long FromUtcTicks, long ToUtcTicks) Resolve(FilterClock clock)
    {
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.Now, clock.Zone).DateTime);
        var (first, last) = Preset switch
        {
            FilterDateRangePreset.Last7Days => (today.AddDays(-6), today),
            FilterDateRangePreset.Last30Days => (today.AddDays(-29), today),
            FilterDateRangePreset.Last90Days => (today.AddDays(-89), today),
            FilterDateRangePreset.ThisYear => (new DateOnly(today.Year, 1, 1), new DateOnly(today.Year, 12, 31)),
            _ => (From!.Value, To!.Value)
        };
        return (StartOfDayUtcTicks(first, clock.Zone), StartOfDayUtcTicks(last.AddDays(1), clock.Zone));
    }

    /// <summary>How a filter comparison writes the range: the preset's name, or the custom range's first and last day.</summary>
    internal string ComparisonKey => Preset is { } preset
        ? PresetName(preset)
        : From!.Value.ToString(DayFormat, CultureInfo.InvariantCulture) + ".." + To!.Value.ToString(DayFormat, CultureInfo.InvariantCulture);

    // A midnight that doesn't exist in the zone takes the zone's standard offset rather than throwing.
    private static long StartOfDayUtcTicks(DateOnly day, TimeZoneInfo zone)
    {
        var midnight = day.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(midnight, zone.GetUtcOffset(midnight)).UtcTicks;
    }
}

/// <summary>The time and time zone a filter's date ranges resolve against, read once per query so its parts agree.</summary>
public readonly record struct FilterClock(DateTimeOffset Now, TimeZoneInfo Zone)
{
    public static FilterClock From(TimeProvider time) => new(time.GetUtcNow(), time.LocalTimeZone);
}
