using Avalonia;
using Avalonia.Headless;
using Avalonia.Themes.Fluent;
using System.Runtime.CompilerServices;

namespace ReelRoulette.DesktopApp.Tests;

/// <summary>
/// One headless Avalonia session for every UI test in this assembly.
/// </summary>
internal static class HeadlessTestSession
{
    private static readonly Lazy<HeadlessUnitTestSession> Session =
        new(() => HeadlessUnitTestSession.StartNew(typeof(HeadlessTestApp)));

    private static readonly HeadlessRunGuard Guard =
        new(action => Session.Value.Dispatch(action, CancellationToken.None));

    public static T Run<T>(Func<T> action)
    {
        return Guard.Run(action);
    }

    /// <summary>
    /// Fails with <see cref="TimeoutException"/> instead of waiting forever when the UI thread never finishes.
    /// </summary>
    public static T Run<T>(
        Func<T> action,
        TimeSpan timeout,
        [CallerMemberName] string testName = "",
        [CallerFilePath] string testFile = "")
    {
        return Guard.Run(action, timeout, $"{Path.GetFileNameWithoutExtension(testFile)}.{testName}");
    }
}

/// <summary>
/// Runs work through a dispatcher and, once one run times out, fails every run still waiting and every later
/// one, since the UI thread that timed out is still stuck and anything queued behind it would wait forever.
/// </summary>
internal sealed class HeadlessRunGuard(Func<Func<object?>, Task<object?>> dispatch)
{
    private readonly CancellationTokenSource _broken = new();
    private volatile string? _timedOutTest;

    public T Run<T>(Func<T> action)
    {
        return Run(action, Timeout.InfiniteTimeSpan, testName: null);
    }

    public T Run<T>(Func<T> action, TimeSpan timeout, string? testName)
    {
        ThrowIfBroken();
        var task = dispatch(() => action());
        bool finished;
        try
        {
            finished = Task.WaitAny([task], (int)timeout.TotalMilliseconds, _broken.Token) == 0;
        }
        catch (OperationCanceledException)
        {
            ThrowIfBroken();
            throw;
        }

        if (!finished)
        {
            _timedOutTest = testName;
            _broken.Cancel();
            throw new TimeoutException(
                $"The UI thread did not finish {testName} within {timeout.TotalSeconds:0} seconds; later headless tests will fail.");
        }

        return (T)task.GetAwaiter().GetResult()!;
    }

    private void ThrowIfBroken()
    {
        if (_broken.IsCancellationRequested)
        {
            throw new InvalidOperationException(
                $"The headless UI thread is still stuck after {_timedOutTest} timed out, so this test cannot run.");
        }
    }
}

public sealed class HeadlessTestApp : Application
{
    public static AppBuilder BuildAvaloniaApp()
    {
        return AppBuilder.Configure<HeadlessTestApp>()
            .UseHeadless(new AvaloniaHeadlessPlatformOptions { UseHeadlessDrawing = true });
    }

    public override void Initialize()
    {
        Styles.Add(new FluentTheme());
    }
}
