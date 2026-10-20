namespace ReelRoulette.Core.Filtering;

/// <summary>
/// The video containers a browser can play, by file extension, which the browser-playable filter keeps. mkv is left
/// out even though some browsers open it, since a container can't show its audio codec and mkv files don't play
/// reliably across browsers. Photos are always playable. Documented in docs/api.md.
/// </summary>
public static class BrowserPlayableContainers
{
    /// <summary>The playable video extensions, lowercase with the leading dot.</summary>
    public static IReadOnlyList<string> VideoExtensions { get; } = [".mp4", ".m4v", ".webm"];
}
