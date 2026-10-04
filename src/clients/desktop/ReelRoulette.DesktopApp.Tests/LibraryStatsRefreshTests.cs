using System.Collections.Concurrent;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LibraryStatsRefreshTests
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task ABurstDuringTheGatherDelayFetchesOnce()
    {
        var harness = new Harness();

        var waiters = Enumerable.Range(0, 30).Select(_ => harness.Refresh.RequestAsync()).ToList();
        harness.ReleaseGather();
        await harness.CompleteFetchAsync(1, Stats(totalPlays: 30));
        await Task.WhenAll(waiters).WaitAsync(Wait);

        Assert.Equal(1, harness.FetchCount);
        Assert.Equal(30, harness.Applied.Last()!.Global.TotalPlays);
    }

    [Fact]
    public async Task RequestsDuringAFetchGetExactlyOneMoreFetch()
    {
        var harness = new Harness();

        var first = harness.Refresh.RequestAsync();
        harness.ReleaseGather();
        await harness.FetchStarted(1).Task.WaitAsync(Wait);
        var during = Enumerable.Range(0, 20).Select(_ => harness.Refresh.RequestAsync()).ToList();
        await harness.CompleteFetchAsync(1, Stats(totalPlays: 1));
        await first.WaitAsync(Wait);
        Assert.All(during, waiter => Assert.False(waiter.IsCompleted));

        harness.ReleaseGather();
        await harness.CompleteFetchAsync(2, Stats(totalPlays: 21));
        await Task.WhenAll(during).WaitAsync(Wait);

        Assert.Equal(2, harness.FetchCount);
        Assert.Equal(21, harness.Applied.Last()!.Global.TotalPlays);
    }

    [Fact]
    public async Task ARequestAfterTheBurstSettlesStartsANewFetch()
    {
        var harness = new Harness();

        var first = harness.Refresh.RequestAsync();
        harness.ReleaseGather();
        await harness.CompleteFetchAsync(1, Stats(totalPlays: 1));
        await first.WaitAsync(Wait);

        var second = harness.Refresh.RequestAsync();
        harness.ReleaseGather();
        await harness.CompleteFetchAsync(2, Stats(totalPlays: 2));
        await second.WaitAsync(Wait);

        Assert.Equal(2, harness.FetchCount);
    }

    [Fact]
    public async Task AFailedFetchStillCompletesItsRequests()
    {
        var harness = new Harness();

        var waiter = harness.Refresh.RequestAsync();
        harness.ReleaseGather();
        await harness.FetchStarted(1).Task.WaitAsync(Wait);
        harness.FailFetch();
        await waiter.WaitAsync(Wait);

        var next = harness.Refresh.RequestAsync();
        harness.ReleaseGather();
        await harness.CompleteFetchAsync(2, Stats(totalPlays: 3));
        await next.WaitAsync(Wait);

        Assert.Equal(2, harness.FetchCount);
        Assert.Equal(3, harness.Applied.Last()!.Global.TotalPlays);
    }

    private static CoreLibraryStatsResponse Stats(int totalPlays)
    {
        return new CoreLibraryStatsResponse { Global = new CoreLibraryGlobalStatsResponse { TotalPlays = totalPlays } };
    }

    private sealed class Harness
    {
        private readonly SemaphoreSlim _gatherReleases = new(0);
        private readonly ConcurrentQueue<TaskCompletionSource<CoreLibraryStatsResponse?>> _fetches = new();
        private readonly ConcurrentDictionary<int, TaskCompletionSource> _fetchStarted = new();
        private int _fetchCount;

        public Harness()
        {
            Refresh = new LibraryStatsRefresh(
                () =>
                {
                    var fetch = new TaskCompletionSource<CoreLibraryStatsResponse?>(TaskCreationOptions.RunContinuationsAsynchronously);
                    _fetches.Enqueue(fetch);
                    var count = Interlocked.Increment(ref _fetchCount);
                    FetchStarted(count).TrySetResult();
                    return fetch.Task;
                },
                stats =>
                {
                    Applied.Add(stats);
                    return Task.CompletedTask;
                },
                () => _gatherReleases.WaitAsync());
        }

        public LibraryStatsRefresh Refresh { get; }

        public List<CoreLibraryStatsResponse?> Applied { get; } = [];

        public int FetchCount => Volatile.Read(ref _fetchCount);

        public TaskCompletionSource FetchStarted(int count)
        {
            return _fetchStarted.GetOrAdd(count, _ => new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously));
        }

        public void ReleaseGather()
        {
            _gatherReleases.Release();
        }

        public async Task CompleteFetchAsync(int fetchNumber, CoreLibraryStatsResponse stats)
        {
            await FetchStarted(fetchNumber).Task.WaitAsync(Wait);
            Assert.True(_fetches.TryDequeue(out var fetch));
            fetch!.SetResult(stats);
        }

        public void FailFetch()
        {
            Assert.True(_fetches.TryDequeue(out var fetch));
            fetch!.SetException(new InvalidOperationException("offline"));
        }
    }
}
