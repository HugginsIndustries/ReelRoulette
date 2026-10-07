using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class EventStreamTests
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task QuietServerRestart_AClientThatGotNoEventsStillGetsTheChangeMadeAfterTheRestart()
    {
        var beforeRestart = new ServerStateService();
        var opened = Assert.Single(await ReadStreamAsync(beforeRestart, lastEventId: null, frames: 1));
        Assert.Equal("streamOpened", opened.EventType);
        Assert.Equal(0, opened.Revision);

        var afterRestart = new ServerStateService();
        afterRestart.PublishExternal("itemStateChanged", Favorite("clip.mp4"));

        var resumed = Assert.Single(await ReadStreamAsync(afterRestart, lastEventId: opened.Revision, frames: 1));
        Assert.Equal("itemStateChanged", resumed.EventType);
        Assert.Equal(1, resumed.Revision);
    }

    [Fact]
    public async Task AStreamWithoutALastEventIdStartsWithTheCurrentRevision()
    {
        var state = new ServerStateService();
        state.PublishExternal("itemStateChanged", Favorite("a.mp4"));
        state.PublishExternal("itemStateChanged", Favorite("b.mp4"));

        var opened = Assert.Single(await ReadStreamAsync(state, lastEventId: null, frames: 1));

        Assert.Equal("streamOpened", opened.EventType);
        Assert.Equal(2, opened.Revision);
        Assert.Equal(2, opened.Payload.GetProperty("currentRevision").GetInt64());
        Assert.Equal(2, state.GetCurrentRevision());
    }

    [Fact]
    public async Task AStreamWithALastEventIdDoesNotGetStreamOpened()
    {
        var state = new ServerStateService();
        state.PublishExternal("itemStateChanged", Favorite("a.mp4"));
        state.PublishExternal("itemStateChanged", Favorite("b.mp4"));

        var replayed = Assert.Single(await ReadStreamAsync(state, lastEventId: 1, frames: 1));

        Assert.Equal("itemStateChanged", replayed.EventType);
        Assert.Equal(2, replayed.Revision);
    }

    [Fact]
    public void ReplayAfter_ALastEventIdOfZeroReplaysFromTheStartOrReportsAGap()
    {
        var state = new ServerStateService();
        Assert.False(state.GetReplayAfter(0).GapDetected);

        state.PublishExternal("itemStateChanged", Favorite("a.mp4"));
        var replay = state.GetReplayAfter(0);
        Assert.False(replay.GapDetected);
        Assert.Single(replay.Events);

        for (var i = 0; i < 300; i++)
        {
            state.PublishExternal("itemStateChanged", Favorite($"clip-{i}.mp4"));
        }

        Assert.True(state.GetReplayAfter(0).GapDetected);
    }

    [Fact]
    public async Task AnOpenStreamEndsWhenTheServerStartsStopping()
    {
        var clients = new ConnectedClientTracker();
        var body = new FrameCapture();
        using var aborted = new CancellationTokenSource();
        using var stopping = new CancellationTokenSource();
        var context = NewStreamContext(body, aborted.Token);

        var stream = ServerHostComposition.StreamEventsAsync(context, new ServerStateService(), clients, new OperatorTestingService(), stopping.Token);
        await body.WaitForFramesAsync(1).WaitAsync(Wait);
        Assert.Single(clients.GetActiveSseClients());

        stopping.Cancel();

        // Ends without an error and without the client disconnecting.
        await stream.WaitAsync(Wait);
        Assert.False(aborted.IsCancellationRequested);
        Assert.Empty(clients.GetActiveSseClients());
    }

    [Fact]
    public async Task AStreamOpenedWhileTheServerIsStoppingEndsAtOnce()
    {
        var clients = new ConnectedClientTracker();
        var body = new FrameCapture();
        using var aborted = new CancellationTokenSource();
        using var stopping = new CancellationTokenSource();
        stopping.Cancel();
        var context = NewStreamContext(body, aborted.Token);

        await ServerHostComposition.StreamEventsAsync(context, new ServerStateService(), clients, new OperatorTestingService(), stopping.Token)
            .WaitAsync(Wait);

        Assert.Empty(clients.GetActiveSseClients());
    }

    [Fact]
    public async Task TheStreamAsksAProxyNotToBufferIt()
    {
        using var aborted = new CancellationTokenSource();
        using var stopping = new CancellationTokenSource();
        stopping.Cancel();
        var context = NewStreamContext(new FrameCapture(), aborted.Token);

        await ServerHostComposition.StreamEventsAsync(context, new ServerStateService(), new ConnectedClientTracker(), new OperatorTestingService(), stopping.Token)
            .WaitAsync(Wait);

        Assert.Equal("no", context.Response.Headers["X-Accel-Buffering"].ToString());
    }

    [Fact]
    public async Task AStreamThatFailsOnWriteRemovesItsSubscription()
    {
        var state = new ServerStateService();
        using var aborted = new CancellationTokenSource();
        var context = new DefaultHttpContext
        {
            RequestServices = new ServiceCollection().AddSingleton<ApiTelemetryService>().BuildServiceProvider(),
            RequestAborted = aborted.Token
        };
        // The first write comes before the stream subscribes; the next one fails.
        context.Response.Body = new FailingBody(writesBeforeFailure: 1);

        await Assert.ThrowsAsync<IOException>(() =>
            ServerHostComposition.StreamEventsAsync(context, state, new ConnectedClientTracker(), new OperatorTestingService(), CancellationToken.None)
                .WaitAsync(Wait));

        var deadline = DateTime.UtcNow + Wait;
        while (state.SubscriberCount > 0 && DateTime.UtcNow < deadline)
        {
            await Task.Delay(10);
        }

        Assert.Equal(0, state.SubscriberCount);
        Assert.False(aborted.IsCancellationRequested);
    }

    private static ItemStateChangedPayload Favorite(string path)
    {
        return new ItemStateChangedPayload { ItemId = path, Path = path, IsFavorite = true, IsBlacklisted = false };
    }

    private static DefaultHttpContext NewStreamContext(FrameCapture body, CancellationToken requestAborted)
    {
        var context = new DefaultHttpContext
        {
            RequestServices = new ServiceCollection().AddSingleton<ApiTelemetryService>().BuildServiceProvider(),
            RequestAborted = requestAborted
        };
        context.Response.Body = body;
        return context;
    }

    private static async Task<List<StreamFrame>> ReadStreamAsync(ServerStateService state, long? lastEventId, int frames)
    {
        var body = new FrameCapture();
        using var aborted = new CancellationTokenSource();
        var context = NewStreamContext(body, aborted.Token);
        if (lastEventId.HasValue)
        {
            context.Request.QueryString = new QueryString($"?lastEventId={lastEventId.Value}");
        }

        var stream = ServerHostComposition.StreamEventsAsync(context, state, new ConnectedClientTracker(), new OperatorTestingService(), CancellationToken.None);
        await body.WaitForFramesAsync(frames).WaitAsync(Wait);
        aborted.Cancel();
        try
        {
            await stream.WaitAsync(Wait);
        }
        catch (OperationCanceledException)
        {
        }

        return body.Frames();
    }

    private sealed record StreamFrame(string EventType, long Revision, JsonElement Payload);

    /// <summary>
    /// A response body whose connection breaks after a number of writes, while the request is not aborted.
    /// </summary>
    private sealed class FailingBody(int writesBeforeFailure) : Stream
    {
        private int _writes;

        public override void Write(byte[] buffer, int offset, int count)
        {
            if (Interlocked.Increment(ref _writes) > writesBeforeFailure)
            {
                throw new IOException("Connection reset.");
            }
        }

        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
        {
            Write(buffer, offset, count);
            return Task.CompletedTask;
        }

        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            Write([], 0, 0);
            return ValueTask.CompletedTask;
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
    }

    /// <summary>
    /// A response body that collects the event frames the stream writes.
    /// </summary>
    private sealed class FrameCapture : Stream
    {
        private readonly object _lock = new();
        private readonly StringBuilder _text = new();
        private readonly List<(int Count, TaskCompletionSource Done)> _waiters = [];

        public Task WaitForFramesAsync(int count)
        {
            lock (_lock)
            {
                var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                _waiters.Add((count, done));
                Release();
                return done.Task;
            }
        }

        public List<StreamFrame> Frames()
        {
            lock (_lock)
            {
                return ParseFrames(_text.ToString());
            }
        }

        public override void Write(byte[] buffer, int offset, int count)
        {
            lock (_lock)
            {
                _text.Append(Encoding.UTF8.GetString(buffer, offset, count));
                Release();
            }
        }

        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
        {
            Write(buffer, offset, count);
            return Task.CompletedTask;
        }

        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            Write(buffer.ToArray(), 0, buffer.Length);
            return ValueTask.CompletedTask;
        }

        private void Release()
        {
            var count = ParseFrames(_text.ToString()).Count;
            foreach (var waiter in _waiters.Where(waiter => count >= waiter.Count))
            {
                waiter.Done.TrySetResult();
            }
        }

        private static List<StreamFrame> ParseFrames(string text)
        {
            var frames = new List<StreamFrame>();
            foreach (var block in text.Split("\n\n"))
            {
                var data = block.Split('\n').FirstOrDefault(line => line.StartsWith("data: ", StringComparison.Ordinal));
                if (data == null)
                {
                    continue;
                }

                using var envelope = JsonDocument.Parse(data["data: ".Length..]);
                var root = envelope.RootElement;
                frames.Add(new StreamFrame(
                    root.GetProperty("eventType").GetString()!,
                    root.GetProperty("revision").GetInt64(),
                    root.GetProperty("payload").Clone()));
            }

            return frames;
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
    }
}
