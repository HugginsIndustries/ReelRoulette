using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace ReelRoulette;

public static class PhotoPlaybackStreamOpener
{
    public static bool IsRemoteSource(string? playbackSource, bool usedApiPath)
    {
        if (usedApiPath)
        {
            return true;
        }

        return Uri.TryCreate(playbackSource, UriKind.Absolute, out var uri) &&
               (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }

    public static async Task<Stream> OpenReadStreamAsync(
        HttpClient httpClient,
        string playbackSource,
        bool usedApiPath,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(playbackSource))
        {
            throw new ArgumentException("Playback source is required.", nameof(playbackSource));
        }

        if (IsRemoteSource(playbackSource, usedApiPath))
        {
            using var response = await httpClient
                .GetAsync(playbackSource, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
                .ConfigureAwait(false);
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                throw new FileNotFoundException($"Photo not found at remote source: {playbackSource}");
            }

            response.EnsureSuccessStatusCode();
            await using var remoteStream = await response.Content
                .ReadAsStreamAsync(cancellationToken)
                .ConfigureAwait(false);
            var memoryStream = new MemoryStream();
            await remoteStream.CopyToAsync(memoryStream, cancellationToken).ConfigureAwait(false);
            memoryStream.Position = 0;
            return memoryStream;
        }

        if (!File.Exists(playbackSource))
        {
            throw new FileNotFoundException($"Photo file not found: {playbackSource}");
        }

        return File.OpenRead(playbackSource);
    }
}
