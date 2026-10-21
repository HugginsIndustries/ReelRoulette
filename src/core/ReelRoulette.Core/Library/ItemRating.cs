namespace ReelRoulette.Core.Library;

/// <summary>
/// An item's rating: ½ to 5 stars in half-star steps, or none. The catalog stores it as a whole number of half stars
/// from 1 to 10, with no value for none and never 0, so "0 stars" and "not rated" can't both exist. The API gives it
/// in stars.
/// </summary>
public static class ItemRating
{
    public const int MinHalfStars = 1;
    public const int MaxHalfStars = 10;

    public static bool IsStoredValue(int halfStars) => halfStars is >= MinHalfStars and <= MaxHalfStars;

    public static double ToStars(int halfStars) => halfStars / 2.0;
}
