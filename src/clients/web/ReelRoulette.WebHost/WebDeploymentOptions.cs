namespace ReelRoulette.WebHost;

public sealed class WebDeploymentOptions
{
    public string ListenUrl { get; set; } = "http://localhost:51302";
    public string DeployRootPath { get; set; } = ".web-deploy";
    public string ActiveManifestFileName { get; set; } = "active-manifest.json";

    public string ActiveManifestPath => Path.Combine(DeployRootPath, ActiveManifestFileName);

    public static WebDeploymentOptions FromConfiguration(IConfiguration configuration, string contentRootPath)
    {
        var options = new WebDeploymentOptions();
        configuration.GetSection("WebDeployment").Bind(options);

        if (string.IsNullOrWhiteSpace(options.ListenUrl))
        {
            options.ListenUrl = "http://localhost:51302";
        }

        if (string.IsNullOrWhiteSpace(options.ActiveManifestFileName))
        {
            options.ActiveManifestFileName = "active-manifest.json";
        }

        if (string.IsNullOrWhiteSpace(options.DeployRootPath))
        {
            options.DeployRootPath = ".web-deploy";
        }

        options.DeployRootPath = Path.GetFullPath(
            Path.IsPathRooted(options.DeployRootPath)
                ? options.DeployRootPath
                : Path.Combine(contentRootPath, options.DeployRootPath));

        return options;
    }
}
