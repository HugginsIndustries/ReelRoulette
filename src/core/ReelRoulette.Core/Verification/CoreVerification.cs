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
        var memory = new RandomPickMemory();
        var items = new List<RandomizationItem>
        {
            new() { Id = "one", FullPath = @"C:\one.mp4" },
            new() { Id = "two", FullPath = @"C:\two.mp4" }
        };
        var selected = RandomSelectionEngineCore.SelectItem(memory, items, RandomPickOptions.Default, DateTime.UtcNow, new Random(7));
        if (selected == null)
        {
            result.Issues.Add(new VerificationIssue
            {
                Name = "Randomization",
                Message = "Expected a random pick with the default options to return an item."
            });
        }
    }
}
