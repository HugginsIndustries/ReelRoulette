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

    public void Dispose()
    {
        LibraryCatalogBackup.WaitForPending();
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
