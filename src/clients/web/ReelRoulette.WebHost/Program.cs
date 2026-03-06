using Microsoft.AspNetCore.StaticFiles;
using ReelRoulette.WebHost;
using System.Text.Json;
using System.Text.Json.Nodes;

var builder = WebApplication.CreateBuilder(args);
var deploymentOptions = WebDeploymentOptions.FromConfiguration(builder.Configuration, builder.Environment.ContentRootPath);
builder.WebHost.UseUrls(deploymentOptions.ListenUrl);

builder.Services.AddSingleton(deploymentOptions);
builder.Services.AddSingleton<ActiveVersionResolver>();
builder.Services.AddSingleton<FileExtensionContentTypeProvider>();

var app = builder.Build();

app.MapGet("/health", (ActiveVersionResolver resolver) =>
{
    var manifest = resolver.GetActiveManifest();
    return Results.Ok(new
    {
        status = "ok",
        activeVersion = manifest.ActiveVersion,
        previousVersion = manifest.PreviousVersion
    });
});

app.MapMethods("/{**requestPath}", new[] { "GET", "HEAD" }, async (
    HttpContext context,
    string? requestPath,
    ActiveVersionResolver resolver,
    FileExtensionContentTypeProvider contentTypes,
    WebDeploymentOptions options) =>
{
    var manifest = resolver.GetActiveManifest();
    var normalized = NormalizeRequestPath(requestPath);
    if (normalized == "__invalid__")
    {
        return Results.BadRequest("Invalid path.");
    }

    var relativePath = normalized;

    if (!resolver.TryResolveFilePath(manifest.ActiveVersion, relativePath, out var absolutePath))
    {
        return Results.BadRequest("Invalid path.");
    }

    if (!File.Exists(absolutePath))
    {
        var isSpaRoute = !Path.HasExtension(normalized);
        if (isSpaRoute &&
            resolver.TryResolveFilePath(manifest.ActiveVersion, "index.html", out var spaPath) &&
            File.Exists(spaPath))
        {
            relativePath = "index.html";
            absolutePath = spaPath;
        }
        else
        {
            return Results.NotFound();
        }
    }

    context.Response.Headers.CacheControl = CachePolicyResolver.Resolve(relativePath);
    context.Response.Headers["X-ReelRoulette-Web-Version"] = manifest.ActiveVersion;

    if (relativePath.Equals("runtime-config.json", StringComparison.OrdinalIgnoreCase))
    {
        return BuildRuntimeConfigResult(context, absolutePath, options);
    }

    if (!contentTypes.TryGetContentType(absolutePath, out var contentType))
    {
        contentType = "application/octet-stream";
    }

    if (HttpMethods.IsHead(context.Request.Method))
    {
        context.Response.ContentType = contentType;
        context.Response.ContentLength = new FileInfo(absolutePath).Length;
        return Results.Empty;
    }

    return Results.File(absolutePath, contentType);
});

app.Run();

static string NormalizeRequestPath(string? requestPath)
{
    if (string.IsNullOrWhiteSpace(requestPath))
    {
        return "index.html";
    }

    var path = requestPath.Replace('\\', '/').Trim('/');
    if (path.Length == 0)
    {
        return "index.html";
    }

    if (path.Contains("..", StringComparison.Ordinal))
    {
        return "__invalid__";
    }

    return path;
}

static IResult BuildRuntimeConfigResult(HttpContext context, string absolutePath, WebDeploymentOptions options)
{
    try
    {
        var json = File.ReadAllText(absolutePath);
        var node = JsonNode.Parse(json) as JsonObject;
        if (node is null)
        {
            return Results.Text(json, "application/json");
        }

        var apiHost = ResolveApiHost(context, options);
        if (node["apiBaseUrl"] is JsonValue apiBaseUrlNode &&
            apiBaseUrlNode.TryGetValue<string>(out var apiBaseUrl) &&
            !string.IsNullOrWhiteSpace(apiBaseUrl))
        {
            node["apiBaseUrl"] = RewriteUrlHost(apiBaseUrl, apiHost);
        }

        if (node["sseUrl"] is JsonValue sseUrlNode &&
            sseUrlNode.TryGetValue<string>(out var sseUrl) &&
            !string.IsNullOrWhiteSpace(sseUrl))
        {
            node["sseUrl"] = RewriteUrlHost(sseUrl, apiHost);
        }

        return Results.Text(node.ToJsonString(new JsonSerializerOptions
        {
            WriteIndented = true
        }), "application/json");
    }
    catch
    {
        return Results.File(absolutePath, "application/json");
    }
}

static string ResolveApiHost(HttpContext context, WebDeploymentOptions options)
{
    if (!IsLanEnabled(options.ListenUrl))
    {
        return "localhost";
    }

    var requestHost = context.Request.Host.Host;
    if (!string.IsNullOrWhiteSpace(requestHost) &&
        !requestHost.Equals("0.0.0.0", StringComparison.OrdinalIgnoreCase) &&
        !requestHost.Equals("[::]", StringComparison.OrdinalIgnoreCase))
    {
        return requestHost;
    }

    return "localhost";
}

static bool IsLanEnabled(string listenUrl)
{
    var candidate = (listenUrl ?? string.Empty)
        .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .FirstOrDefault();
    if (string.IsNullOrWhiteSpace(candidate))
    {
        return false;
    }

    if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri))
    {
        return false;
    }

    var host = uri.Host;
    if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
        host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
        host.Equals("::1", StringComparison.OrdinalIgnoreCase))
    {
        return false;
    }

    return true;
}

static string RewriteUrlHost(string originalUrl, string host)
{
    if (!Uri.TryCreate(originalUrl, UriKind.Absolute, out var uri))
    {
        return originalUrl;
    }

    var builder = new UriBuilder(uri)
    {
        Host = host
    };

    return builder.Uri.ToString().TrimEnd('/');
}
