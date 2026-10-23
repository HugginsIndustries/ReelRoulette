using ReelRoulette.Core.Filtering;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class FilterDateRangeTests
{
    // 03:00 UTC on 22 October is 22:00 on 21 October five hours behind UTC, so "today" there is the 21st.
    private static readonly FilterClock LateEvening = new(
        new DateTimeOffset(2030, 10, 22, 3, 0, 0, TimeSpan.Zero),
        FixedTimeProvider.FiveHoursBehindUtc);

    [Theory]
    [InlineData(FilterDateRangePreset.Last7Days, "2030-10-15")]
    [InlineData(FilterDateRangePreset.Last30Days, "2030-09-22")]
    [InlineData(FilterDateRangePreset.Last90Days, "2030-07-24")]
    public void Resolve_LastNDays_IsTodayAndTheDaysBeforeIt_AsWholeDaysInTheClocksZone(FilterDateRangePreset preset, string firstDay)
    {
        var (from, to) = FilterDateRange.Of(preset).Resolve(LateEvening);

        Assert.Equal(LocalMidnight(DateOnly.Parse(firstDay, System.Globalization.CultureInfo.InvariantCulture)), from);
        Assert.Equal(LocalMidnight(new DateOnly(2030, 10, 22)), to);
    }

    [Fact]
    public void Resolve_ThisYear_Is1JanuaryTo31December()
    {
        var (from, to) = FilterDateRange.Of(FilterDateRangePreset.ThisYear).Resolve(LateEvening);

        Assert.Equal(LocalMidnight(new DateOnly(2030, 1, 1)), from);
        Assert.Equal(LocalMidnight(new DateOnly(2031, 1, 1)), to);
    }

    [Fact]
    public void Resolve_ACustomRange_CoversItsFirstAndLastDays()
    {
        var (from, to) = FilterDateRange.Custom(new DateOnly(2030, 1, 3), new DateOnly(2030, 3, 31))!.Resolve(LateEvening);
        Assert.Equal(LocalMidnight(new DateOnly(2030, 1, 3)), from);
        Assert.Equal(LocalMidnight(new DateOnly(2030, 4, 1)), to);

        var (dayFrom, dayTo) = FilterDateRange.Custom(new DateOnly(2030, 5, 6), new DateOnly(2030, 5, 6))!.Resolve(LateEvening);
        Assert.Equal(TimeSpan.FromDays(1).Ticks, dayTo - dayFrom);
    }

    // Daylight saving time starts on 10 March 2030 in this zone, so the range starts at 08:00 UTC, midnight at
    // standard time, and ends at 07:00 UTC, midnight at daylight saving time.
    [Fact]
    public void Resolve_StaysWholeDaysAcrossADaylightSavingChange()
    {
        var rule = TimeZoneInfo.AdjustmentRule.CreateAdjustmentRule(
            DateTime.MinValue.Date,
            DateTime.MaxValue.Date,
            TimeSpan.FromHours(1),
            TimeZoneInfo.TransitionTime.CreateFloatingDateRule(new DateTime(1, 1, 1, 2, 0, 0), 3, 2, DayOfWeek.Sunday),
            TimeZoneInfo.TransitionTime.CreateFloatingDateRule(new DateTime(1, 1, 1, 2, 0, 0), 11, 1, DayOfWeek.Sunday));
        var zone = TimeZoneInfo.CreateCustomTimeZone("Test/Pacific", TimeSpan.FromHours(-8), "Test Pacific", "Standard", "Daylight", [rule]);
        var clock = new FilterClock(new DateTimeOffset(2030, 3, 12, 20, 0, 0, TimeSpan.Zero), zone);

        var (from, to) = FilterDateRange.Of(FilterDateRangePreset.Last7Days).Resolve(clock);

        Assert.Equal(new DateTimeOffset(2030, 3, 6, 8, 0, 0, TimeSpan.Zero).UtcTicks, from);
        Assert.Equal(new DateTimeOffset(2030, 3, 13, 7, 0, 0, TimeSpan.Zero).UtcTicks, to);
    }

    [Fact]
    public void Custom_ThatEndsBeforeItStarts_IsNoRange()
    {
        Assert.Null(FilterDateRange.Custom(new DateOnly(2030, 3, 2), new DateOnly(2030, 3, 1)));
    }

    [Fact]
    public void PresetNames_AreTheFilterStatesNames_ReadInAnyCase()
    {
        Assert.Equal(
            ["last7Days", "last30Days", "last90Days", "thisYear"],
            Enum.GetValues<FilterDateRangePreset>().Select(FilterDateRange.PresetName));
        Assert.True(FilterDateRange.TryParsePreset("THISYEAR", out var preset));
        Assert.Equal(FilterDateRangePreset.ThisYear, preset);
        Assert.False(FilterDateRange.TryParsePreset("last365Days", out _));
    }

    private static long LocalMidnight(DateOnly day) =>
        new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(-5)).UtcTicks;
}
