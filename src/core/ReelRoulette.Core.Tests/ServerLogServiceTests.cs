using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ServerLogServiceTests
{
    private static readonly Regex LineShape = new(
        @"^\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}\] \[(?<source>[a-z-]+)\] \[info\] (?<id>w\d\d-\d{4}) x* END$");

    [Fact]
    public void ParallelAppends_KeepEveryLineWhole()
    {
        const int writers = 16;
        const int perWriter = 100;
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            var (operations, serverLog) = CreateWriters(appDataRoot);
            // One thread per writer, released together, so every writer is appending at the same moment.
            using var start = new Barrier(writers);
            var threads = Enumerable.Range(0, writers).Select(writer => new Thread(() =>
            {
                start.SignalAndWait();
                for (var index = 0; index < perWriter; index++)
                {
                    // Lengths vary so a shorter line written over a longer one would leave a fragment behind.
                    var message = $"w{writer:D2}-{index:D4} {new string('x', (writer * 7 + index) % 90)} END";
                    if (writer % 2 == 0)
                    {
                        operations.AppendClientLog(new ClientLogRequest { Source = "desktop-main-window", Level = "info", Message = message });
                    }
                    else
                    {
                        serverLog.Append("info", message);
                    }
                }
            })).ToArray();
            foreach (var thread in threads)
            {
                thread.Start();
            }

            foreach (var thread in threads)
            {
                thread.Join();
            }

            var lines = File.ReadAllLines(Path.Combine(appDataRoot, "last.log"));
            Assert.Equal(writers * perWriter, lines.Length);
            var ids = new List<string>();
            foreach (var line in lines)
            {
                var match = LineShape.Match(line);
                Assert.True(match.Success, $"Malformed line: {line}");
                var writer = int.Parse(match.Groups["id"].Value[1..3]);
                Assert.Equal(writer % 2 == 0 ? "desktop-main-window" : "server", match.Groups["source"].Value);
                ids.Add(match.Groups["id"].Value);
            }

            var expectedIds = Enumerable.Range(0, writers)
                .SelectMany(writer => Enumerable.Range(0, perWriter).Select(index => $"w{writer:D2}-{index:D4}"))
                .Order(StringComparer.Ordinal);
            Assert.Equal(expectedIds, ids.Order(StringComparer.Ordinal));
        }
        finally
        {
            DeleteTempAppDataRoot(appDataRoot);
        }
    }

    [Fact]
    public void AppendClientLog_WithLineBreaks_WritesOneLine()
    {
        var appDataRoot = CreateTempAppDataRoot();
        try
        {
            var (operations, _) = CreateWriters(appDataRoot);
            operations.AppendClientLog(new ClientLogRequest
            {
                Source = "webui\n[2026-01-01 00:00:00.000] [server] [info] forged",
                Level = "info",
                Message = "first\nsecond\r\nthird\rfourth"
            });

            var lines = File.ReadAllLines(Path.Combine(appDataRoot, "last.log"));
            var line = Assert.Single(lines);
            Assert.EndsWith(@"[info] first\nsecond\nthird\nfourth", line);
            Assert.Contains(@"[webui\n[2026-01-01 00:00:00.000] [server] [info] forged]", line);
        }
        finally
        {
            DeleteTempAppDataRoot(appDataRoot);
        }
    }

    private static (LibraryOperationsService Operations, ServerLogService ServerLog) CreateWriters(string appDataRoot)
    {
        // Backups off, so the only lines in last.log are the ones the test writes.
        File.WriteAllText(Path.Combine(appDataRoot, "core-settings.json"), """{ "backup": { "enabled": false } }""");
        CatalogSeed.Write(appDataRoot);
        var operations = new LibraryOperationsService(CatalogOpen.Host(appDataRoot), NullLogger<LibraryOperationsService>.Instance, appDataRoot);
        LibraryCatalogBackup.WaitForPending();
        File.Delete(Path.Combine(appDataRoot, "last.log"));
        return (operations, new ServerLogService(appDataRoot));
    }

    private static string CreateTempAppDataRoot()
    {
        var root = Path.Combine(TestIsolation.RootDirectory, "server-log-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }

    private static void DeleteTempAppDataRoot(string appDataRoot)
    {
        LibraryCatalogBackup.WaitForPending();
        if (Directory.Exists(appDataRoot))
        {
            Directory.Delete(appDataRoot, recursive: true);
        }
    }
}
