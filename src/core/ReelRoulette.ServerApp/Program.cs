using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;

var builder = WebApplication.CreateBuilder(args);
var runtimeOptions = ServerRuntimeOptions.FromConfiguration(builder.Configuration);
var startupSettings = new CoreSettingsService(NullLogger<CoreSettingsService>.Instance, runtimeOptions);
var startupWebRuntime = startupSettings.GetWebRuntimeSettings();
ServerAppRuntimeHelpers.ApplyWebRuntimeSettingsToRuntimeOptions(runtimeOptions, startupWebRuntime);
var webUiEnabledAtStartup = startupWebRuntime.Enabled;
var corsOrigins = new DynamicCorsOriginRegistry(runtimeOptions);
var serverAppOptions = ServerAppOptions.FromConfiguration(builder.Configuration);

builder.WebHost.UseUrls(runtimeOptions.ListenUrl);
builder.Services.AddSingleton(runtimeOptions);
builder.Services.AddSingleton(serverAppOptions);
builder.Services.AddSingleton(corsOrigins);
builder.Services.AddSingleton<RestartCoordinator>();
builder.Services.AddCors(options =>
{
    options.AddPolicy(ServerHostComposition.WebClientCorsPolicyName, cors =>
    {
        cors.SetIsOriginAllowed(corsOrigins.IsAllowed);
        cors.WithMethods("GET", "POST", "OPTIONS")
            .WithHeaders("Content-Type", "Authorization", "Last-Event-ID");
        if (runtimeOptions.CorsAllowCredentials)
        {
            cors.AllowCredentials();
        }
    });
});
builder.Services.AddReelRouletteServer();

var app = builder.Build();
app.MapReelRouletteEndpoints(runtimeOptions);

corsOrigins.Start(
    app.Services.GetRequiredService<CoreSettingsService>(),
    app.Logger);
app.Lifetime.ApplicationStopping.Register(corsOrigins.Stop);

MapRuntimeConfig(app, runtimeOptions, startupWebRuntime);
MapOperatorUi(app, serverAppOptions, webUiEnabledAtStartup);
MapRestartEndpoints(app, serverAppOptions);
MapWebUiStaticServing(app, serverAppOptions, webUiEnabledAtStartup);

app.Lifetime.ApplicationStarted.Register(() =>
{
    app.Logger.LogInformation("ReelRoulette.ServerApp started on {ListenUrl}", runtimeOptions.ListenUrl);
});

app.Lifetime.ApplicationStopping.Register(() =>
{
    app.Logger.LogInformation("ReelRoulette.ServerApp is shutting down.");
});

app.Run();

static void MapRuntimeConfig(
    WebApplication app,
    ServerRuntimeOptions runtimeOptions,
    WebRuntimeSettingsSnapshot startupWebRuntime)
{
    app.MapGet("/runtime-config.json", (HttpContext context) =>
    {
        if (!startupWebRuntime.Enabled)
        {
            return Results.NotFound();
        }

        var authModeOff = string.Equals(startupWebRuntime.AuthMode, "Off", StringComparison.OrdinalIgnoreCase);
        var pairToken = !runtimeOptions.RequireAuth || authModeOff
            ? null
            : startupWebRuntime.SharedToken ?? runtimeOptions.PairingToken;

        var root = $"{context.Request.Scheme}://{context.Request.Host.Value}";
        var payload = new
        {
            apiBaseUrl = root,
            sseUrl = $"{root}/api/events",
            pairToken
        };

        context.Response.Headers["Cache-Control"] = "no-store";
        return Results.Text(JsonSerializer.Serialize(payload, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true
        }), "application/json");
    });
}

static void MapOperatorUi(WebApplication app, ServerAppOptions options, bool webUiEnabledAtStartup)
{
    app.MapGet(options.OperatorUiPath, () =>
    {
        const string htmlTemplate = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ReelRoulette Server</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 24px; max-width: 900px; }
    h1,h2 { margin-bottom: 8px; }
    .row { display: flex; gap: 16px; flex-wrap: wrap; }
    .card { border: 1px solid #d0d0d0; border-radius: 8px; padding: 16px; min-width: 0; flex: 1; }
    label { display: block; margin-top: 10px; font-weight: 600; }
    input, select, button { margin-top: 4px; padding: 8px; font-size: 14px; width: 100%; box-sizing: border-box; }
    button { cursor: pointer; }
    .inline { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
    .inline input { width: auto; margin-top: 0; }
    .status {
      white-space: pre-wrap;
      font-family: Consolas, monospace;
      background: #f7f7f7;
      padding: 12px;
      border-radius: 6px;
      overflow-wrap: anywhere;
      word-break: break-word;
      overflow: auto;
      max-height: 220px;
    }
    .status-note {
      margin-top: 10px;
      font-size: 13px;
      line-height: 1.4;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .status-note.error { color: #a80000; }
  </style>
</head>
<body>
  <h1>ReelRoulette Server</h1>
  <p>Single-process runtime operator surface (status, settings, restart).</p>

  <div class="row">
    <div class="card">
      <h2>Runtime Status</h2>
      <div id="status" class="status">Loading...</div>
      <button id="refreshStatus">Refresh status</button>
      <button id="restartRuntime">Restart server process</button>
    </div>

    <div class="card">
      <h2>Web Runtime Settings</h2>
      <div class="inline">
        <input id="webEnabled" type="checkbox" />
        <label for="webEnabled" style="margin-top:0;">Enabled</label>
      </div>
      <div class="inline">
        <input id="bindOnLan" type="checkbox" />
        <label for="bindOnLan" style="margin-top:0;">Bind on LAN</label>
      </div>
      <label for="webPort">Port</label>
      <input id="webPort" type="number" min="1" max="65535" />
      <label for="lanHostname">LAN Hostname</label>
      <input id="lanHostname" type="text" />
      <label for="authMode">Auth Mode</label>
      <select id="authMode">
        <option value="Off">Off</option>
        <option value="TokenRequired">TokenRequired</option>
      </select>
      <label for="sharedToken">Shared Token</label>
      <input id="sharedToken" type="text" />
      <button id="saveWebSettings">Apply web runtime settings</button>
      <div id="settingsStatus" class="status-note"></div>
    </div>
  </div>

  <script>
    let lastLoadedSettings = null;
    const webUiEnabledAtStartup = __WEBUI_ENABLED_AT_STARTUP__;

    async function getJson(url, init) {
      const response = await fetch(url, init);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(url + " -> HTTP " + response.status + "\\n" + body);
      }
      return response.json();
    }

    function setStatus(text) {
      document.getElementById("status").textContent = text;
    }

    function setSettingsStatus(messageHtml, isError = false) {
      const node = document.getElementById("settingsStatus");
      node.className = isError ? "status-note error" : "status-note";
      node.innerHTML = messageHtml;
    }

    function hasRuntimeDelta(before, after) {
      if (!before) {
        return true;
      }

      return !!(
        before.enabled !== after.enabled ||
        before.bindOnLan !== after.bindOnLan ||
        Number(before.port ?? 0) !== Number(after.port ?? 0) ||
        String(before.authMode ?? "") !== String(after.authMode ?? "") ||
        String(before.sharedToken ?? "") !== String(after.sharedToken ?? "")
      );
    }

    function buildNextOperatorUrls(settings) {
      const protocol = window.location.protocol;
      const path = window.location.pathname || "/operator";
      const port = Number(settings.port || 51234);
      const local = `${protocol}//localhost:${port}${path}`;
      const lan = settings.bindOnLan
        ? `${protocol}//${(settings.lanHostname || window.location.hostname || "localhost")}:${port}${path}`
        : null;

      return { local, lan };
    }

    async function refreshStatus() {
      const [health, version, caps] = await Promise.all([
        getJson("/health"),
        getJson("/api/version"),
        getJson("/api/capabilities")
      ]);
      const statusText = [
        "health:\\n" + JSON.stringify(health, null, 2),
        "version:\\n" + JSON.stringify(version, null, 2),
        "capabilities:\\n" + JSON.stringify(caps, null, 2),
        "webUiEnabledAtStartup:\\n" + JSON.stringify(webUiEnabledAtStartup, null, 2)
      ].join("\\n\\n");
      setStatus(statusText);
    }

    async function loadWebRuntimeSettings() {
      const settings = await getJson("/api/web-runtime/settings");
      lastLoadedSettings = settings;
      document.getElementById("webEnabled").checked = !!settings.enabled;
      document.getElementById("bindOnLan").checked = !!settings.bindOnLan;
      document.getElementById("webPort").value = settings.port ?? 51234;
      document.getElementById("lanHostname").value = settings.lanHostname ?? "reel";
      document.getElementById("authMode").value = settings.authMode ?? "TokenRequired";
      document.getElementById("sharedToken").value = settings.sharedToken ?? "";
    }

    async function saveWebRuntimeSettings() {
      const before = lastLoadedSettings;
      const payload = {
        enabled: document.getElementById("webEnabled").checked,
        bindOnLan: document.getElementById("bindOnLan").checked,
        port: Number(document.getElementById("webPort").value || "51234"),
        lanHostname: document.getElementById("lanHostname").value || "reel",
        authMode: document.getElementById("authMode").value || "TokenRequired",
        sharedToken: document.getElementById("sharedToken").value || null
      };
      const updated = await getJson("/api/web-runtime/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      await Promise.all([loadWebRuntimeSettings(), refreshStatus()]);

      const restartRequired = hasRuntimeDelta(before, updated);
      if (restartRequired) {
        const next = buildNextOperatorUrls(updated);
        const links = [
          `<a href="${next.local}">${next.local}</a>`,
          next.lan ? `<a href="${next.lan}">${next.lan}</a>` : null
        ].filter(Boolean).join(" | ");
        setSettingsStatus(`Settings saved. <strong>Restart required</strong> for changes to take effect. Next operator URL(s): ${links}`);
      } else {
        setSettingsStatus("Settings saved. No restart required.");
      }
    }

    async function restartRuntime() {
      const result = await getJson("/control/restart", { method: "POST" });
      setStatus(["restart requested: " + JSON.stringify(result)]);
    }

    document.getElementById("refreshStatus").addEventListener("click", () => refreshStatus().catch(err => setStatus(err.message)));
    document.getElementById("saveWebSettings").addEventListener("click", () => saveWebRuntimeSettings().catch(err => setSettingsStatus(err.message, true)));
    document.getElementById("restartRuntime").addEventListener("click", () => restartRuntime().catch(err => setStatus(err.message)));
    Promise.all([refreshStatus(), loadWebRuntimeSettings()]).catch(err => setStatus(err.message));
  </script>
</body>
</html>
""";
        var html = htmlTemplate.Replace("__WEBUI_ENABLED_AT_STARTUP__", webUiEnabledAtStartup ? "true" : "false");
        return Results.Text(html, "text/html");
    });
}

static void MapRestartEndpoints(WebApplication app, ServerAppOptions options)
{
    app.MapPost("/control/restart", async (HttpContext context, RestartCoordinator restarter) =>
    {
        if (!IsLoopbackRequest(context))
        {
            return Results.Json(new { error = "Forbidden. Restart endpoint is localhost-only." }, statusCode: StatusCodes.Status403Forbidden);
        }

        var result = await restarter.TryRestartAsync("operator-requested", options.EnableSelfRestart, context.RequestAborted);
        return result.Accepted
            ? Results.Ok(result)
            : Results.Json(result, statusCode: StatusCodes.Status409Conflict);
    });
}

static void MapWebUiStaticServing(WebApplication app, ServerAppOptions options, bool webUiEnabledAtStartup)
{
    if (!webUiEnabledAtStartup)
    {
        return;
    }

    var staticRoot = ResolveWebUiStaticRoot(app.Environment.ContentRootPath, options.WebUiStaticRootPath);
    if (string.IsNullOrWhiteSpace(staticRoot) || !Directory.Exists(staticRoot))
    {
        app.MapGet("/", () => Results.Text(
            "ReelRoulette Server is running. WebUI build artifacts are missing. Build WebUI and configure ServerApp:WebUiStaticRootPath if needed.\nOperator UI: /operator",
            "text/plain"));
        return;
    }

    app.UseDefaultFiles(new DefaultFilesOptions
    {
        FileProvider = new PhysicalFileProvider(staticRoot)
    });

    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(staticRoot),
        OnPrepareResponse = ctx =>
        {
            if (ctx.File.Name.Equals("index.html", StringComparison.OrdinalIgnoreCase) ||
                ctx.File.Name.Equals("runtime-config.json", StringComparison.OrdinalIgnoreCase))
            {
                ctx.Context.Response.Headers["Cache-Control"] = "no-store";
            }
            else if (ctx.Context.Request.Path.StartsWithSegments("/assets"))
            {
                ctx.Context.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
            }
        }
    });

    app.MapFallback((HttpContext context) =>
    {
        if (context.Request.Path.StartsWithSegments("/api") ||
            context.Request.Path.StartsWithSegments("/control"))
        {
            return Results.NotFound();
        }

        var indexPath = Path.Combine(staticRoot, "index.html");
        if (!File.Exists(indexPath))
        {
            return Results.NotFound();
        }

        context.Response.Headers["Cache-Control"] = "no-store";
        return Results.File(indexPath, "text/html");
    });
}

static string? ResolveWebUiStaticRoot(string contentRootPath, string? explicitPath)
{
    if (!string.IsNullOrWhiteSpace(explicitPath))
    {
        return Path.GetFullPath(explicitPath);
    }

    var fromRepo = Path.GetFullPath(Path.Combine(
        contentRootPath,
        "..",
        "..",
        "clients",
        "web",
        "ReelRoulette.WebUI",
        "dist"));
    if (Directory.Exists(fromRepo))
    {
        return fromRepo;
    }

    var localWwwroot = Path.Combine(contentRootPath, "wwwroot");
    if (Directory.Exists(localWwwroot))
    {
        return localWwwroot;
    }

    return null;
}

static bool IsLoopbackRequest(HttpContext context)
{
    var remote = context.Connection.RemoteIpAddress;
    return remote is null || System.Net.IPAddress.IsLoopback(remote);
}

file sealed class ServerAppOptions
{
    public string? WebUiStaticRootPath { get; set; }
    public bool EnableSelfRestart { get; set; } = true;
    public string OperatorUiPath { get; set; } = "/operator";

    public static ServerAppOptions FromConfiguration(IConfiguration configuration)
    {
        var options = new ServerAppOptions();
        configuration.GetSection("ServerApp").Bind(options);
        if (string.IsNullOrWhiteSpace(options.OperatorUiPath))
        {
            options.OperatorUiPath = "/operator";
        }

        if (!options.OperatorUiPath.StartsWith('/'))
        {
            options.OperatorUiPath = "/" + options.OperatorUiPath;
        }

        return options;
    }
}

file sealed class RestartCoordinator
{
    private readonly ILogger<RestartCoordinator> _logger;
    private readonly IHostApplicationLifetime _lifetime;
    private readonly CoreSettingsService _settings;
    private readonly ServerRuntimeOptions _runtimeOptions;
    private int _restartInProgress;

    public RestartCoordinator(
        ILogger<RestartCoordinator> logger,
        IHostApplicationLifetime lifetime,
        CoreSettingsService settings,
        ServerRuntimeOptions runtimeOptions)
    {
        _logger = logger;
        _lifetime = lifetime;
        _settings = settings;
        _runtimeOptions = runtimeOptions;
    }

    public async Task<RestartResult> TryRestartAsync(string reason, bool enableSelfRestart, CancellationToken cancellationToken)
    {
        if (Interlocked.Exchange(ref _restartInProgress, 1) == 1)
        {
            return new RestartResult(false, "Restart already in progress.");
        }

        try
        {
            _logger.LogInformation("Server restart requested ({Reason}).", reason);
            if (enableSelfRestart && TryLaunchReplacementProcess(out var launchMessage))
            {
                _logger.LogInformation("Replacement server process launch succeeded ({Message}).", launchMessage);
            }
            else if (enableSelfRestart)
            {
                _logger.LogWarning("Replacement server process launch failed; proceeding with graceful shutdown only.");
            }

            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);
                }
                catch (OperationCanceledException)
                {
                }
                finally
                {
                    _lifetime.StopApplication();
                }
            }, CancellationToken.None);

            return new RestartResult(true, "Restart scheduled.");
        }
        finally
        {
            Interlocked.Exchange(ref _restartInProgress, 0);
        }
    }

    private bool TryLaunchReplacementProcess(out string message)
    {
        message = "not-started";
        try
        {
            var webRuntime = _settings.GetWebRuntimeSettings();
            var effectiveListenUrl = ServerAppRuntimeHelpers.BuildListenUrlFromWebRuntime(webRuntime, _runtimeOptions.ListenUrl);
            var requireAuth = !string.Equals(webRuntime.AuthMode, "Off", StringComparison.OrdinalIgnoreCase);
            var pairingToken = requireAuth
                ? (string.IsNullOrWhiteSpace(webRuntime.SharedToken) ? _runtimeOptions.PairingToken : webRuntime.SharedToken!.Trim())
                : string.Empty;

            var processPath = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(processPath))
            {
                message = "process-path-unavailable";
                return false;
            }

            var args = Environment.GetCommandLineArgs();
            var argumentBuilder = new StringBuilder();
            for (var i = 1; i < args.Length; i++)
            {
                if (i > 1)
                {
                    argumentBuilder.Append(' ');
                }

                argumentBuilder.Append('"').Append(args[i].Replace("\"", "\\\"")).Append('"');
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = processPath,
                Arguments = argumentBuilder.ToString(),
                WorkingDirectory = Environment.CurrentDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                Environment =
                {
                    ["CoreServer__ListenUrl"] = effectiveListenUrl,
                    ["CoreServer__BindOnLan"] = webRuntime.BindOnLan ? "true" : "false",
                    ["CoreServer__RequireAuth"] = requireAuth ? "true" : "false",
                    ["CoreServer__PairingToken"] = pairingToken,
                    ["CoreServer__TrustLocalhost"] = _runtimeOptions.TrustLocalhost ? "true" : "false"
                }
            });

            message = "replacement-process-started";
            return true;
        }
        catch (Exception ex)
        {
            message = ex.Message;
            return false;
        }
    }
}

file sealed record RestartResult(bool Accepted, string Message);

file static class ServerAppRuntimeHelpers
{
    public static void ApplyWebRuntimeSettingsToRuntimeOptions(ServerRuntimeOptions options, WebRuntimeSettingsSnapshot webRuntime)
    {
        if (ShouldApplyPersistedListenUrl(options.ListenUrl))
        {
            options.ListenUrl = BuildListenUrlFromWebRuntime(webRuntime, options.ListenUrl);
            options.BindOnLan = webRuntime.BindOnLan;
        }

        options.RequireAuth = !string.Equals(webRuntime.AuthMode, "Off", StringComparison.OrdinalIgnoreCase);

        if (options.RequireAuth && !string.IsNullOrWhiteSpace(webRuntime.SharedToken))
        {
            options.PairingToken = webRuntime.SharedToken.Trim();
        }
    }

    private static bool ShouldApplyPersistedListenUrl(string configuredListenUrl)
    {
        if (!Uri.TryCreate(configuredListenUrl, UriKind.Absolute, out var uri))
        {
            return true;
        }

        var isDefaultPort = uri.Port == 51234;
        var isDefaultHost =
            uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
            uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
            uri.Host.Equals("::1", StringComparison.OrdinalIgnoreCase) ||
            uri.Host.Equals("0.0.0.0", StringComparison.OrdinalIgnoreCase);

        return isDefaultPort && isDefaultHost;
    }

    public static string BuildListenUrlFromWebRuntime(WebRuntimeSettingsSnapshot webRuntime, string fallbackListenUrl)
    {
        var scheme = "http";
        var fallbackPort = 51234;
        if (Uri.TryCreate(fallbackListenUrl, UriKind.Absolute, out var fallbackUri))
        {
            scheme = fallbackUri.Scheme;
            fallbackPort = fallbackUri.Port > 0 ? fallbackUri.Port : fallbackPort;
        }

        var host = webRuntime.BindOnLan ? "0.0.0.0" : "localhost";
        var port = webRuntime.Port > 0 ? webRuntime.Port : fallbackPort;
        return $"{scheme}://{host}:{port}";
    }
}
