using ReelRoulette.Core.Verification;
using ReelRoulette.Server.Services;

var verbose = args.Any(arg => string.Equals(arg, "--verbose", StringComparison.OrdinalIgnoreCase));

if (verbose)
{
    Console.WriteLine("Running shared core verification checks...");
}

var result = CoreVerification.RunAll();
if (!result.Success)
{
    Console.WriteLine("Core verification failed.");
    foreach (var issue in result.Issues)
    {
        Console.WriteLine($"- {issue.Name}: {issue.Message}");
    }

    Environment.ExitCode = 1;
    return;
}

var serverState = new ServerStateService();
var eventA = serverState.CreateEnvelope("systemCheck", new { index = 1 });
var eventB = serverState.CreateEnvelope("systemCheck", new { index = 2 });
if (eventB.Revision <= eventA.Revision)
{
    Console.WriteLine("Server envelope revision check failed.");
    Environment.ExitCode = 1;
    return;
}

if (verbose)
{
    Console.WriteLine("Core verification passed.");
    Console.WriteLine("System-check placeholders:");
    Console.WriteLine("- Migration fixture checks");
    Console.WriteLine("- Fingerprint pipeline invariants");
    Console.WriteLine("- Refresh reconciliation fixtures");
    Console.WriteLine("- Performance sanity budgets");
}

Console.WriteLine("All core verification checks passed.");
