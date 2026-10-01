namespace ReelRoulette.Core.Tags;

/// <summary>
/// Display order for tag and category names, shared by server and desktop and mirrored by the WebUI.
/// </summary>
public sealed class TagNameComparer : IComparer<string>
{
    public static readonly TagNameComparer Instance = new();

    private TagNameComparer()
    {
    }

    public int Compare(string? x, string? y)
    {
        // Lower-case before comparing codes so '_' and other ASCII punctuation between 'Z' and 'a' sort before letters.
        // Matches the WebUI copy only for ASCII names: ToLowerInvariant and JavaScript toLowerCase differ on some
        // non-ASCII letters, for example a final sigma.
        var left = x ?? string.Empty;
        var right = y ?? string.Empty;
        var folded = string.CompareOrdinal(left.ToLowerInvariant(), right.ToLowerInvariant());
        return folded != 0 ? folded : string.CompareOrdinal(left, right);
    }
}
