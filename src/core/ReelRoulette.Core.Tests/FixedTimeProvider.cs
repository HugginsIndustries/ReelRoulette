namespace ReelRoulette.Core.Tests;

/// <summary>A clock stopped at one moment in one time zone, for date range tests.</summary>
internal sealed class FixedTimeProvider(DateTimeOffset now, TimeZoneInfo zone) : TimeProvider
{
    /// <summary>A zone five hours behind UTC, with no daylight saving time.</summary>
    public static TimeZoneInfo FiveHoursBehindUtc { get; } =
        TimeZoneInfo.CreateCustomTimeZone("Test/UTC-5", TimeSpan.FromHours(-5), "UTC-5", "UTC-5");

    public override DateTimeOffset GetUtcNow() => now.ToUniversalTime();

    public override TimeZoneInfo LocalTimeZone => zone;
}
