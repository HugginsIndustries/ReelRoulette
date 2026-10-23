namespace ReelRoulette.Core.Tests;

/// <summary>A clock that stands still at a set moment in one time zone until a test moves it.</summary>
internal sealed class TestClock(DateTimeOffset now, TimeZoneInfo? zone = null) : TimeProvider
{
    /// <summary>A zone five hours behind UTC, with no daylight saving time.</summary>
    public static TimeZoneInfo FiveHoursBehindUtc { get; } =
        TimeZoneInfo.CreateCustomTimeZone("Test/UTC-5", TimeSpan.FromHours(-5), "UTC-5", "UTC-5");

    public DateTimeOffset Now { get; set; } = now;

    public override DateTimeOffset GetUtcNow() => Now.ToUniversalTime();

    public override TimeZoneInfo LocalTimeZone => zone ?? TimeZoneInfo.Utc;

    public void Advance(TimeSpan by) => Now += by;
}
