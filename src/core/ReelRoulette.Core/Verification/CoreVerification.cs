using ReelRoulette.Core.Randomization;

namespace ReelRoulette.Core.Verification;

public sealed class VerificationIssue
{
    public required string Name { get; init; }
    public required string Message { get; init; }
}

public sealed class VerificationResult
{
    public List<VerificationIssue> Issues { get; } = new();
    public bool Success => Issues.Count == 0;
}

public static class CoreVerification
{
    public static VerificationResult RunAll()
    {
        var result = new VerificationResult();
        VerifyRandomization(result);
        return result;
    }

    private static void VerifyRandomization(VerificationResult result)
    {
        var rng = new Random(7);
        var state = new RandomizationRuntimeStateCore();
        var items = new List<RandomizationItem>
        {
            new() { FullPath = @"C:\one.mp4" },
            new() { FullPath = @"C:\two.mp4" }
        };
        var selected = RandomSelectionEngineCore.SelectPath(state, RandomizationModeValue.SmartShuffle, items, rng);
        if (string.IsNullOrWhiteSpace(selected))
        {
            result.Issues.Add(new VerificationIssue
            {
                Name = "Randomization",
                Message = "Expected SmartShuffle selection to return a path."
            });
        }
    }
}
