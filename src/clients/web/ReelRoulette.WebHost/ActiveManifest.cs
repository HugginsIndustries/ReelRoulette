namespace ReelRoulette.WebHost;

public sealed class ActiveManifest
{
    public string ActiveVersion { get; set; } = string.Empty;
    public string? PreviousVersion { get; set; }
    public string ActivatedUtc { get; set; } = DateTimeOffset.UtcNow.ToString("O");
}
