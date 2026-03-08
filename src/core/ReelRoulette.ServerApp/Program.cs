using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.ServerApp;
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
ServerAppRuntimeHelpers.ResetServerLastLog();

builder.WebHost.UseUrls(runtimeOptions.ListenUrl);
builder.Services.AddSingleton(runtimeOptions);
builder.Services.AddSingleton(serverAppOptions);
builder.Services.AddSingleton(corsOrigins);
builder.Services.AddSingleton<RestartCoordinator>();
builder.Services.AddHostedService<WebUiMdnsService>();
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
    :root {
      color-scheme: dark;
      --bg: #0f1115;
      --card: #171b22;
      --border: #2a3140;
      --text: #dde4f1;
      --muted: #a7b2c5;
      --accent: #60a5fa;
      --ok: #10b981;
      --warn: #f59e0b;
      --error: #f87171;
      --mono: "Cascadia Code", Consolas, monospace;
      --ui: "Segoe UI", Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      background: var(--bg);
      color: var(--text);
      font-family: var(--ui);
    }
    h1, h2, h3 { margin: 0 0 10px 0; }
    p { margin: 0 0 10px 0; color: var(--muted); }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }
    .card {
      grid-column: span 12;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      min-width: 0;
    }
    .card.two-col { grid-column: span 12; }
    .card.events { grid-column: span 12; }
    .card.clients { grid-column: span 12; }
    @media (min-width: 980px) {
      .card.two-col { grid-column: span 6; }
      .card.events { grid-column: span 8; }
      .card.clients { grid-column: span 4; }
    }
    label {
      display: block;
      margin-top: 10px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 600;
    }
    input, select, button {
      margin-top: 4px;
      width: 100%;
      border: 1px solid var(--border);
      background: #111722;
      color: var(--text);
      border-radius: 8px;
      padding: 9px 10px;
      font-size: 14px;
    }
    button { cursor: pointer; }
    button:hover { border-color: var(--accent); }
    .inline {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 8px;
    }
    .inline input { width: auto; margin-top: 0; }
    .row-actions {
      margin-top: 10px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    @media (min-width: 620px) {
      .row-actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    .status-box {
      white-space: pre-wrap;
      font-family: var(--mono);
      background: #111722;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      overflow-wrap: anywhere;
      word-break: break-word;
      overflow: auto;
      max-height: 280px;
      min-height: 140px;
      font-size: 12px;
      line-height: 1.4;
    }
    .status-note {
      margin-top: 10px;
      font-size: 13px;
      line-height: 1.4;
      overflow-wrap: anywhere;
      word-break: break-word;
      color: var(--muted);
    }
    .status-note.error { color: var(--error); }
    .pill {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 12px;
      border: 1px solid var(--border);
      color: var(--muted);
      margin-right: 6px;
      margin-bottom: 6px;
    }
    .table-wrap {
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      max-height: 320px;
      margin-top: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 700px;
      font-size: 12px;
      font-family: var(--mono);
    }
    th, td {
      border-bottom: 1px solid var(--border);
      text-align: left;
      padding: 7px 9px;
      white-space: nowrap;
    }
    th { color: var(--muted); }
    .muted { color: var(--muted); }
    .ok { color: var(--ok); }
    .warn { color: var(--warn); }
    .error { color: var(--error); }
  </style>
</head>
<body>
  <div class="container">
    <div class="card two-col">
      <h1>ReelRoulette Server</h1>
      <p>Control-plane operator surface for runtime status, settings, telemetry, and lifecycle actions.</p>
      <h3>Runtime Status</h3>
      <div id="status" class="status-box">Loading...</div>
      <div class="row-actions">
        <button id="refreshStatus">Refresh status</button>
        <button id="restartRuntime">Restart process</button>
        <button id="stopRuntime">Stop process</button>
      </div>
    </div>

    <div class="card two-col">
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

    <div class="card two-col">
      <h2>Control Settings</h2>
      <label for="adminAuthMode">Admin Auth Mode</label>
      <select id="adminAuthMode">
        <option value="Off">Off</option>
        <option value="TokenRequired">TokenRequired</option>
      </select>
      <label for="adminSharedToken">Admin Shared Token</label>
      <input id="adminSharedToken" type="text" />
      <button id="saveControlSettings">Apply control settings</button>
      <label for="pairToken">Pair Token (for /control/pair)</label>
      <input id="pairToken" type="text" />
      <button id="pairControl">Pair control session</button>
      <div id="controlStatus" class="status-note"></div>
    </div>

    <div class="card clients">
      <h2>Connected Clients</h2>
      <div id="clients" class="status-box">Loading...</div>
    </div>

    <div class="card events">
      <h2>Incoming API Events</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Event</th></tr></thead>
          <tbody id="incomingEventsBody"></tbody>
        </table>
      </div>
      <h2 style="margin-top:12px;">Outgoing API Events</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Event</th></tr></thead>
          <tbody id="outgoingEventsBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    let lastLoadedSettings = null;
    let lastLoadedControlSettings = null;
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

    function setControlStatus(messageHtml, isError = false) {
      const node = document.getElementById("controlStatus");
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

    function renderEvents(targetId, events) {
      const body = document.getElementById(targetId);
      body.innerHTML = "";
      (events || []).forEach(evt => {
        const tr = document.createElement("tr");
        const ts = evt.timestampUtc ? new Date(evt.timestampUtc).toLocaleTimeString() : "-";
        tr.innerHTML =
          `<td>${ts}</td><td>${evt.method || "-"}</td><td>${evt.path || "-"}</td><td>${evt.statusCode ?? "-"}</td><td>${evt.eventType || "-"}</td>`;
        body.appendChild(tr);
      });
    }

    function renderConnectedClients(connected) {
      const node = document.getElementById("clients");
      if (!connected) {
        node.textContent = "No client data.";
        return;
      }

      node.innerHTML =
        `API paired sessions: ${connected.apiPairedSessions ?? 0}\n` +
        `Control paired sessions: ${connected.controlPairedSessions ?? 0}\n` +
        `SSE subscribers: ${connected.sseSubscribers ?? 0}`;
    }

    async function refreshStatus() {
      const [status, version, caps] = await Promise.all([
        getJson("/control/status"),
        getJson("/api/version"),
        getJson("/api/capabilities")
      ]);
      const statusText = [
        "controlStatus:\\n" + JSON.stringify(status, null, 2),
        "version:\\n" + JSON.stringify(version, null, 2),
        "capabilities:\\n" + JSON.stringify(caps, null, 2),
        "webUiEnabledAtStartup:\\n" + JSON.stringify(webUiEnabledAtStartup, null, 2)
      ].join("\\n\\n");
      setStatus(statusText);
      renderConnectedClients(status.connectedClients);
      renderEvents("incomingEventsBody", status.incomingApiEvents);
      renderEvents("outgoingEventsBody", status.outgoingApiEvents);
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

    async function loadControlSettings() {
      const settings = await getJson("/control/settings");
      lastLoadedControlSettings = settings;
      document.getElementById("adminAuthMode").value = settings.adminAuthMode ?? "Off";
      document.getElementById("adminSharedToken").value = settings.adminSharedToken ?? "";
    }

    async function saveControlSettings() {
      const payload = {
        adminAuthMode: document.getElementById("adminAuthMode").value || "Off",
        adminSharedToken: document.getElementById("adminSharedToken").value || null
      };

      const response = await getJson("/control/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = response.result || {};
      if (!result.accepted) {
        const errors = (result.errors || []).join("<br />");
        setControlStatus(`Control settings not applied: ${errors || "Validation failed."}`, true);
        return;
      }

      await Promise.all([loadControlSettings(), refreshStatus()]);
      setControlStatus(result.message || "Control settings applied.");
    }

    async function pairControl() {
      const token = document.getElementById("pairToken").value || "";
      const response = await getJson("/control/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      setControlStatus(response.message || "Control pairing complete.");
      await refreshStatus();
    }

    async function restartRuntime() {
      const result = await getJson("/control/restart", { method: "POST" });
      setStatus("restart requested:\\n" + JSON.stringify(result, null, 2));
    }

    async function stopRuntime() {
      const result = await getJson("/control/stop", { method: "POST" });
      setStatus("stop requested:\\n" + JSON.stringify(result, null, 2));
    }

    document.getElementById("refreshStatus").addEventListener("click", () => refreshStatus().catch(err => setStatus(err.message)));
    document.getElementById("saveWebSettings").addEventListener("click", () => saveWebRuntimeSettings().catch(err => setSettingsStatus(err.message, true)));
    document.getElementById("saveControlSettings").addEventListener("click", () => saveControlSettings().catch(err => setControlStatus(err.message, true)));
    document.getElementById("pairControl").addEventListener("click", () => pairControl().catch(err => setControlStatus(err.message, true)));
    document.getElementById("restartRuntime").addEventListener("click", () => restartRuntime().catch(err => setStatus(err.message)));
    document.getElementById("stopRuntime").addEventListener("click", () => stopRuntime().catch(err => setStatus(err.message)));
    Promise.all([refreshStatus(), loadWebRuntimeSettings(), loadControlSettings()]).catch(err => setStatus(err.message));
    setInterval(() => refreshStatus().catch(() => {}), 3000);
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
        var result = await restarter.TryRestartAsync("operator-requested", options.EnableSelfRestart, context.RequestAborted);
        return result.Accepted
            ? Results.Ok(result)
            : Results.Json(result, statusCode: StatusCodes.Status409Conflict);
    });

    app.MapPost("/control/stop", async (HttpContext context, RestartCoordinator restarter) =>
    {
        var result = await restarter.TryStopAsync("operator-requested-stop", context.RequestAborted);
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

        var accepted = false;
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

            accepted = true;
            return new RestartResult(true, "Restart scheduled.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Restart request failed before scheduling shutdown.");
            return new RestartResult(false, "Restart failed before scheduling.");
        }
        finally
        {
            if (!accepted)
            {
                Interlocked.Exchange(ref _restartInProgress, 0);
            }
        }
    }

    public async Task<RestartResult> TryStopAsync(string reason, CancellationToken cancellationToken)
    {
        if (Interlocked.Exchange(ref _restartInProgress, 1) == 1)
        {
            return new RestartResult(false, "A lifecycle operation is already in progress.");
        }

        var accepted = false;
        try
        {
            _logger.LogInformation("Server stop requested ({Reason}).", reason);
            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(TimeSpan.FromMilliseconds(300), cancellationToken);
                }
                catch (OperationCanceledException)
                {
                }
                finally
                {
                    _lifetime.StopApplication();
                }
            }, CancellationToken.None);

            accepted = true;
            return new RestartResult(true, "Stop scheduled.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Stop request failed before scheduling shutdown.");
            return new RestartResult(false, "Stop failed before scheduling.");
        }
        finally
        {
            if (!accepted)
            {
                Interlocked.Exchange(ref _restartInProgress, 0);
            }
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

            string fileName;
            string arguments;
            if (IsDotnetHostExecutable(processPath))
            {
                var entryAssemblyPath = Assembly.GetEntryAssembly()?.Location;
                if (string.IsNullOrWhiteSpace(entryAssemblyPath) || !File.Exists(entryAssemblyPath))
                {
                    message = "entry-assembly-path-unavailable";
                    return false;
                }

                fileName = processPath;
                arguments = $"\"{entryAssemblyPath}\"";
            }
            else
            {
                fileName = processPath;
                arguments = string.Empty;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
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

    private static bool IsDotnetHostExecutable(string processPath)
    {
        var name = Path.GetFileNameWithoutExtension(processPath);
        return string.Equals(name, "dotnet", StringComparison.OrdinalIgnoreCase);
    }
}

file sealed record RestartResult(bool Accepted, string Message);

file static class ServerAppRuntimeHelpers
{
    public static void ResetServerLastLog()
    {
        try
        {
            var appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
            Directory.CreateDirectory(appData);
            var logPath = Path.Combine(appData, "last.log");
            File.WriteAllText(logPath, string.Empty);
        }
        catch
        {
            // Reset failures must not block startup.
        }
    }

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
