using Microsoft.AspNetCore.StaticFiles;
using ReelRoulette.WebHost;

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
    FileExtensionContentTypeProvider contentTypes) =>
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
