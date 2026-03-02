namespace ReelRoulette.Core.Fingerprints;

public sealed class FingerprintDuplicateItem
{
    public string ItemId { get; set; } = string.Empty;
    public string Fingerprint { get; set; } = string.Empty;
    public bool IsReady { get; set; }
}

public sealed class FingerprintDuplicateGroup
{
    public string Fingerprint { get; set; } = string.Empty;
    public List<string> ItemIds { get; set; } = new();
}

public static class FingerprintDuplicateHelper
{
    public static IReadOnlyList<FingerprintDuplicateGroup> BuildExactDuplicateGroups(IEnumerable<FingerprintDuplicateItem> items)
    {
        return items
            .Where(i => i.IsReady && !string.IsNullOrWhiteSpace(i.Fingerprint) && !string.IsNullOrWhiteSpace(i.ItemId))
            .GroupBy(i => i.Fingerprint, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1)
            .Select(group => new FingerprintDuplicateGroup
            {
                Fingerprint = group.Key,
                ItemIds = group.Select(i => i.ItemId).ToList()
            })
            .OrderBy(group => group.ItemIds.Count)
            .ToList();
    }
}
