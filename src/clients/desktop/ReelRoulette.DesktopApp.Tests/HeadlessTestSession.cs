using Avalonia;
using Avalonia.Headless;
using Avalonia.Themes.Fluent;

namespace ReelRoulette.DesktopApp.Tests;

/// <summary>
/// One headless Avalonia session for every UI test in this assembly.
/// </summary>
internal static class HeadlessTestSession
{
    private static readonly Lazy<HeadlessUnitTestSession> Session =
        new(() => HeadlessUnitTestSession.StartNew(typeof(HeadlessTestApp)));

    public static T Run<T>(Func<T> action)
    {
        return Session.Value.Dispatch(action, CancellationToken.None).GetAwaiter().GetResult();
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
