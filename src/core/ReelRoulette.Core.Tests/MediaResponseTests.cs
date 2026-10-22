using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class MediaResponseTests : IDisposable
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);
    private readonly string _appData = Path.Combine(Path.GetTempPath(), "reelroulette-media-response", Guid.NewGuid().ToString("N"));

    public MediaResponseTests()
    {
        Directory.CreateDirectory(_appData);
    }

    [Fact]
    public async Task AMediaResponseThePlayerStoppedReadingIsCutWhenTheServerStartsStopping()
    {
        var mediaPath = Path.Combine(_appData, "clip.mp4");
        File.WriteAllBytes(mediaPath, new byte[1024 * 1024]);
        var tokens = new ServerMediaTokenStore();
        var token = tokens.CreateToken(mediaPath);
        var playback = new LibraryPlaybackService(tokens, NullLogger<LibraryPlaybackService>.Instance, CatalogOpen.Host(_appData));

        var connection = new Connection();
        var player = new StalledPlayer();
        var context = new DefaultHttpContext
        {
            RequestServices = new ServiceCollection().AddLogging().BuildServiceProvider()
        };
        context.Features.Set<IHttpRequestLifetimeFeature>(connection);
        context.Response.Body = player;
        using var stopping = new CancellationTokenSource();

        var result = ServerHostComposition.ServeMedia(context, token, playback, new OperatorTestingService(), stopping.Token);
        var sending = result.ExecuteAsync(context);
        await player.WriteStarted.WaitAsync(Wait);
        Assert.False(sending.IsCompleted);
        Assert.False(connection.Aborted);

        stopping.Cancel();

        var ended = await Record.ExceptionAsync(() => sending.WaitAsync(Wait));
        Assert.True(ended is null or OperationCanceledException, $"Sending ended with {ended}");
        Assert.True(connection.Aborted);
    }

    [Fact]
    public async Task TheMediaRouteStreamsAnIssuedToken_AndRefusesAnItemIdOrAFullPath()
    {
        var mediaPath = Path.Combine(_appData, "clip.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02, 0x03]);
        CatalogSeed.Write(
            _appData,
            sources: [new SeedSource("s1", _appData)],
            items: [new SeedItem("item-1", mediaPath) { SourceId = "s1", FileName = "clip.mp4" }]);
        var playback = new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, CatalogOpen.Host(_appData));
        Assert.True(playback.TryPlayItem("item-1", forceMediaMissing: false, out var played, out _, out _, out _));
        var token = played!.MediaUrl["/api/media/".Length..];

        var (tokenStatus, tokenBody) = await Serve(token);
        Assert.Equal(StatusCodes.Status200OK, tokenStatus);
        Assert.Equal([0x01, 0x02, 0x03], tokenBody);
        Assert.Equal(StatusCodes.Status404NotFound, (await Serve("item-1")).Status);
        Assert.Equal(StatusCodes.Status404NotFound, (await Serve(mediaPath)).Status);

        async Task<(int Status, byte[] Body)> Serve(string requested)
        {
            var context = new DefaultHttpContext
            {
                RequestServices = new ServiceCollection().AddLogging().BuildServiceProvider()
            };
            using var body = new MemoryStream();
            context.Response.Body = body;
            var result = ServerHostComposition.ServeMedia(context, requested, playback, new OperatorTestingService(), CancellationToken.None);
            await result.ExecuteAsync(context);
            return (context.Response.StatusCode, body.ToArray());
        }
    }

    // The route opens the file to tell a missing file from one it can't read, as on a stalled drive or share. Holding
    // the file open with no sharing makes the open fail while the file still exists. A readable file still serves
    // ranges.
    [Fact]
    public async Task TheMediaRoute_Answers404ForAMissingFile_503ForAnUnreadableOne_AndServesRangesOfAReadableOne()
    {
        var mediaPath = Path.Combine(_appData, "secret-clip.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02, 0x03, 0x04]);
        var tokens = new ServerMediaTokenStore();
        var token = tokens.CreateToken(mediaPath);
        var missingToken = tokens.CreateToken(Path.Combine(_appData, "gone.mp4"));
        var playback = new LibraryPlaybackService(tokens, NullLogger<LibraryPlaybackService>.Instance, CatalogOpen.Host(_appData));
        var logDirectory = Path.Combine(_appData, "logs");
        var logs = new ServerLogService(logDirectory);

        var missing = await Serve(missingToken);
        Assert.Equal(StatusCodes.Status404NotFound, missing.Status);
        Assert.Contains("Media not found", System.Text.Encoding.UTF8.GetString(missing.Body), StringComparison.Ordinal);

        (int Status, byte[] Body) unreadable;
        var held = new FileStream(mediaPath, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
        try
        {
            Assert.True(File.Exists(mediaPath));
            unreadable = await Serve(token);
        }
        finally
        {
            held.Dispose();
        }

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, unreadable.Status);
        Assert.Contains("Media can't be read", System.Text.Encoding.UTF8.GetString(unreadable.Body), StringComparison.Ordinal);
        var line = Assert.Single(File.ReadAllLines(Path.Combine(logDirectory, "last.log")));
        Assert.Matches(@"\[server\] \[warn\] Media read failed error=\w+\.$", line);
        Assert.DoesNotContain("secret", line, StringComparison.Ordinal);
        Assert.DoesNotContain(token, line, StringComparison.Ordinal);

        var whole = await Serve(token);
        Assert.Equal(StatusCodes.Status200OK, whole.Status);
        Assert.Equal([0x01, 0x02, 0x03, 0x04], whole.Body);
        var range = await Serve(token, "bytes=1-2");
        Assert.Equal(StatusCodes.Status206PartialContent, range.Status);
        Assert.Equal([0x02, 0x03], range.Body);

        async Task<(int Status, byte[] Body)> Serve(string requested, string? rangeHeader = null)
        {
            var context = new DefaultHttpContext
            {
                RequestServices = new ServiceCollection().AddLogging().AddSingleton(logs).BuildServiceProvider()
            };
            context.Request.Method = HttpMethods.Get;
            if (rangeHeader != null)
            {
                context.Request.Headers.Range = rangeHeader;
            }

            using var body = new MemoryStream();
            context.Response.Body = body;
            var result = ServerHostComposition.ServeMedia(context, requested, playback, new OperatorTestingService(), CancellationToken.None);
            await result.ExecuteAsync(context);
            return (context.Response.StatusCode, body.ToArray());
        }
    }

    public void Dispose()
    {
        if (Directory.Exists(_appData))
        {
            Directory.Delete(_appData, recursive: true);
        }
    }

    /// <summary>
    /// A connection that records being cut, which also ends the request.
    /// </summary>
    private sealed class Connection : IHttpRequestLifetimeFeature
    {
        private readonly CancellationTokenSource _aborted = new();

        public bool Aborted => _aborted.IsCancellationRequested;

        public CancellationToken RequestAborted
        {
            get => _aborted.Token;
            set { }
        }

        public void Abort() => _aborted.Cancel();
    }

    /// <summary>
    /// A response body whose reader stopped reading, as a player does once its buffer is full.
    /// </summary>
    private sealed class StalledPlayer : Stream
    {
        private readonly TaskCompletionSource _writeStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task WriteStarted => _writeStarted.Task;

        public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            _writeStarted.TrySetResult();
            await Task.Delay(Timeout.Infinite, cancellationToken);
        }

        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
        {
            return WriteAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();
        }

        public override bool CanRead => false;
        public override bool CanSeek => false;
        public override bool CanWrite => true;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override Task FlushAsync(CancellationToken cancellationToken) => Task.CompletedTask;
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
