using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Makaretu.Dns;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ReelRoulette.WebRemote.Contracts;

namespace ReelRoulette.WebRemote
{
    /// <summary>
    /// Hosts a Kestrel-based HTTP server for the web remote UI and API.
    /// Lifecycle: Start when enabled, Stop on disable or app exit.
    /// </summary>
    public class WebRemoteServer : IDisposable
    {
        private readonly record struct SseSyncEvent(
            long Revision,
            string Message,
            string ItemId,
            bool IsFavorite,
            bool IsBlacklisted,
            DateTimeOffset TimestampUtc);
        private readonly record struct ClientAckState(
            long Revision,
            DateTimeOffset LastSeenUtc);

        private WebApplication? _app;
        private CancellationTokenSource? _cts;
        private Task? _runTask;
        private readonly object _lock = new object();
        private bool _disposed;
        private IWebRemoteApiServices? _apiServices;
        private MediaTokenStore? _mediaTokenStore;
        private ClientSessionStore? _clientSessionStore;
        private readonly ConcurrentDictionary<ChannelWriter<string>, byte> _sseClients = new();
        private readonly ConcurrentDictionary<string, ClientAckState> _clientAckState = new(StringComparer.OrdinalIgnoreCase);
        private readonly object _eventHistoryLock = new();
        private readonly List<SseSyncEvent> _eventHistory = new();
        private long _nextRevision = 0;
        private Action<string> _log = _ => { };
        private const int MaxSyncEventHistory = 2048;
        private ServiceDiscovery? _mdns;
        private ServiceProfile? _mdnsProfile;

        /// <summary>
        /// Whether the server is currently running.
        /// </summary>
        public bool IsRunning => _runTask != null && !_runTask.IsCompleted;

        /// <summary>
        /// Starts the HTTP server with the given settings and API services.
        /// Does nothing if already running (call Stop first to reconfigure).
        /// </summary>
        public async Task StartAsync(WebRemoteSettings settings, IWebRemoteApiServices? apiServices, Action<string>? log = null)
        {
            log ??= _ => { };
            _log = log;
            if (settings == null)
            {
                log("WebRemoteServer: Cannot start - settings is null");
                return;
            }
            if (!settings.Enabled)
            {
                log("WebRemoteServer: Skipping start - Web Remote is disabled");
                return;
            }

            _apiServices = apiServices;
            _mediaTokenStore = new MediaTokenStore();
            _clientSessionStore = new ClientSessionStore();

            lock (_lock)
            {
                if (_runTask != null && !_runTask.IsCompleted)
                {
                    log("WebRemoteServer: Already running");
                    return;
                }

                var port = settings.Port > 0 ? settings.Port : 51234;
                var bindOnLan = settings.BindOnLan;
                var lanHostname = string.IsNullOrWhiteSpace(settings.LanHostname) ? "reel" : settings.LanHostname.Trim();
                var redirectHttpFromPort80 = bindOnLan && port != 80 && CanBindTcpPort(80, IPAddress.Any);
                if (bindOnLan && port != 80 && !redirectHttpFromPort80)
                    log("WebRemoteServer: Port 80 redirect unavailable (port in use or permission denied). Use explicit :port URL.");

                var builder = WebApplication.CreateBuilder(new WebApplicationOptions
                {
                    Args = Array.Empty<string>(),
                    ContentRootPath = AppContext.BaseDirectory,
                });

                builder.Logging.ClearProviders();
                builder.Logging.SetMinimumLevel(LogLevel.Warning);

                builder.WebHost.ConfigureKestrel(serverOptions =>
                {
                    if (bindOnLan)
                    {
                        serverOptions.ListenAnyIP(port);
                        log($"WebRemoteServer: Listening on 0.0.0.0:{port} (LAN)");
                        if (redirectHttpFromPort80)
                        {
                            serverOptions.ListenAnyIP(80);
                            log($"WebRemoteServer: Listening on 0.0.0.0:80 for redirect to :{port}");
                        }
                    }
                    else
                    {
                        serverOptions.ListenLocalhost(port);
                        log($"WebRemoteServer: Listening on localhost:{port}");
                    }
                });

                _app = builder.Build();

                if (redirectHttpFromPort80)
                {
                    _app.Use(async (context, next) =>
                    {
                        if (context.Connection.LocalPort == 80)
                        {
                            var host = context.Request.Host.Host;
                            if (string.IsNullOrWhiteSpace(host))
                                host = $"{lanHostname}.local";
                            var target = $"http://{host}:{port}{context.Request.PathBase}{context.Request.Path}{context.Request.QueryString}";
                            context.Response.StatusCode = StatusCodes.Status307TemporaryRedirect;
                            context.Response.Headers.Location = target;
                            return;
                        }
                        await next();
                    });
                }

                // Auth middleware when token required (generate token if blank - caller should persist via EnsureWebRemoteToken)
                var effectiveAuthToken = (settings.AuthMode == WebRemoteAuthMode.TokenRequired && !string.IsNullOrEmpty(settings.SharedToken))
                    ? settings.SharedToken
                    : (settings.AuthMode == WebRemoteAuthMode.TokenRequired ? Guid.NewGuid().ToString("N") : null);
                if (effectiveAuthToken != null)
                    _app.Use((ctx, next) => new Auth.WebRemoteAuthMiddleware(next, effectiveAuthToken).InvokeAsync(ctx));

                MapApiEndpoints(_app, settings, effectiveAuthToken, log);

                // Static file fallback - serve web UI from embedded resources or web-remote-dev folder
                _app.Use(async (context, next) =>
                {
                    if (context.Request.Path.StartsWithSegments("/api"))
                    {
                        await next();
                        return;
                    }
                    var path = context.Request.Path.Value ?? "/";
                    var served = await StaticFileResponder.TryServeAsync(context, path);
                    if (!served && (path == "/" || path == "/index.html"))
                        served = await StaticFileResponder.TryServeAsync(context, "index.html");
                    if (!served)
                        await next();
                });

                _cts = new CancellationTokenSource();
                if (bindOnLan)
                    StartMdnsAdvertisement(lanHostname, port);
                else
                    StopMdnsAdvertisement();
                _runTask = _app.RunAsync(_cts.Token);
                log("WebRemoteServer: Started");
            }

            await Task.CompletedTask;
        }

        private void MapApiEndpoints(WebApplication app, WebRemoteSettings settings, string? effectiveAuthToken, Action<string> log)
        {
            var services = _apiServices;
            var tokenStore = _mediaTokenStore!;
            var sessionStore = _clientSessionStore!;

            app.MapGet("/api/pair", (HttpContext context, string? token) =>
            {
                if (settings.AuthMode == WebRemoteAuthMode.Off || effectiveAuthToken == null)
                    return Results.Ok(new { paired = true, message = "Auth disabled" });

                var t = token ?? context.Request.Query["token"].ToString();
                if (string.IsNullOrEmpty(t) || !string.Equals(t, effectiveAuthToken, StringComparison.Ordinal))
                    return Results.Unauthorized();

                context.Response.Cookies.Append(Auth.WebRemoteAuthMiddleware.AuthCookieName, effectiveAuthToken,
                    new CookieOptions
                    {
                        HttpOnly = true,
                        SameSite = SameSiteMode.Lax,
                        Secure = false, // Local network only
                        Path = "/",
                        MaxAge = TimeSpan.FromDays(30)
                    });
                return Results.Ok(new { paired = true, message = "Paired successfully" });
            });

            app.MapPost("/api/pair", (HttpContext context, PairRequestDto? req) =>
            {
                if (settings.AuthMode == WebRemoteAuthMode.Off || effectiveAuthToken == null)
                    return Results.Ok(new { paired = true, message = "Auth disabled" });

                var t = req?.Token ?? context.Request.Query["token"].ToString();
                if (string.IsNullOrEmpty(t) || !string.Equals(t, effectiveAuthToken, StringComparison.Ordinal))
                    return Results.Unauthorized();

                context.Response.Cookies.Append(Auth.WebRemoteAuthMiddleware.AuthCookieName, effectiveAuthToken,
                    new CookieOptions
                    {
                        HttpOnly = true,
                        SameSite = SameSiteMode.Lax,
                        Secure = false,
                        Path = "/",
                        MaxAge = TimeSpan.FromDays(30)
                    });
                return Results.Ok(new { paired = true, message = "Paired successfully" });
            });

            app.MapGet("/api/version", () =>
            {
                var version = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version;
                var appVersion = version != null ? $"{version.Major}.{version.Minor}.{version.Build}" : "1.0.0";
                return Results.Json(new VersionDto
                {
                    AppVersion = appVersion,
                    ApiVersion = "1",
                    AssetsVersion = null
                });
            });

            app.MapGet("/api/presets", () =>
            {
                if (services == null)
                    return Results.Json(Array.Empty<PresetDto>());
                var presets = services.GetFilterPresets();
                var dtos = presets.Select((p, i) => new PresetDto
                {
                    Id = p.Name,
                    Name = p.Name,
                    Summary = null
                }).ToList();
                return Results.Json(dtos);
            });

            app.MapPost("/api/random", async (HttpContext context, RandomRequestDto? req) =>
            {
                if (req == null)
                    return Results.BadRequest("Invalid request body");
                if (services == null)
                    return Results.Problem("API services not available", statusCode: 503);

                var index = services.GetLibraryIndex();
                var filterService = services.GetFilterService();
                var preset = services.GetPresetByName(req.PresetId);

                if (index == null)
                    return Results.Problem("Library not loaded", statusCode: 503);
                if (preset == null)
                    return Results.NotFound($"Preset '{req.PresetId}' not found");

                var filterState = preset.FilterState;
                if (filterState == null)
                    filterState = new FilterState();

                // Apply media type filter from request
                var effectiveFilter = CloneFilterState(filterState);
                if (!req.IncludeVideos && req.IncludePhotos)
                    effectiveFilter.MediaTypeFilter = MediaTypeFilter.PhotosOnly;
                else if (req.IncludeVideos && !req.IncludePhotos)
                    effectiveFilter.MediaTypeFilter = MediaTypeFilter.VideosOnly;
                else if (!req.IncludeVideos && !req.IncludePhotos)
                    return Results.Problem("Must include at least videos or photos", statusCode: 400);

                var eligible = filterService.BuildEligibleSetWithoutFileCheck(effectiveFilter, index).ToList();
                var paths = eligible.Select(i => i.FullPath).ToList();

                var clientId = req.ClientId ?? Guid.NewGuid().ToString("N");
                paths = sessionStore.ExcludeRecent(clientId, paths).ToList();
                if (paths.Count == 0)
                    paths = eligible.Select(i => i.FullPath).ToList();

                var rng = new Random();
                var idx = rng.Next(paths.Count);
                var selectedPath = paths[idx];
                var item = eligible.FirstOrDefault(i => string.Equals(i.FullPath, selectedPath, StringComparison.OrdinalIgnoreCase))
                    ?? services.GetItemByPath(selectedPath);

                if (item == null)
                    return Results.Problem("Selected item not found", statusCode: 500);

                sessionStore.Push(clientId, selectedPath);
                var token = tokenStore.CreateToken(selectedPath);
                var basePath = $"{context.Request.Scheme}://{context.Request.Host}";
                var mediaUrl = $"{basePath}/api/media/{token}";

                var mediaType = item.MediaType == MediaType.Photo ? "photo" : "video";
                var durationSeconds = item.Duration?.TotalSeconds;

                return Results.Json(new RandomResultDto
                {
                    Id = item.FullPath,
                    DisplayName = item.FileName,
                    MediaType = mediaType,
                    DurationSeconds = durationSeconds,
                    MediaUrl = mediaUrl,
                    IsFavorite = item.IsFavorite,
                    IsBlacklisted = item.IsBlacklisted
                });
            });

            app.MapPost("/api/favorite", (FavoriteRequestDto? req) =>
            {
                if (req == null || string.IsNullOrEmpty(req.Path)) return Results.BadRequest("Invalid request");
                if (services == null) return Results.Problem("API services not available", statusCode: 503);
                _log($"WebRemoteServer: API /favorite path='{req.Path}' isFavorite={req.IsFavorite}");
                var item = services.GetItemByPath(req.Path);
                if (item == null) return Results.NotFound();
                if (item.IsFavorite != req.IsFavorite)
                    services.SetItemFavorite(req.Path, req.IsFavorite);
                item = services.GetItemByPath(req.Path);
                if (item == null) return Results.NotFound();
                BroadcastLibraryItemChanged(item.FullPath, item.IsFavorite, item.IsBlacklisted);
                return Results.Ok();
            });

            app.MapPost("/api/blacklist", (BlacklistRequestDto? req) =>
            {
                if (req == null || string.IsNullOrEmpty(req.Path)) return Results.BadRequest("Invalid request");
                if (services == null) return Results.Problem("API services not available", statusCode: 503);
                _log($"WebRemoteServer: API /blacklist path='{req.Path}' isBlacklisted={req.IsBlacklisted}");
                var item = services.GetItemByPath(req.Path);
                if (item == null) return Results.NotFound();
                if (item.IsBlacklisted != req.IsBlacklisted)
                    services.SetItemBlacklist(req.Path, req.IsBlacklisted);
                item = services.GetItemByPath(req.Path);
                if (item == null) return Results.NotFound();
                BroadcastLibraryItemChanged(item.FullPath, item.IsFavorite, item.IsBlacklisted);
                return Results.Ok();
            });

            app.MapPost("/api/library-states", (JsonDocument? req) =>
            {
                if (services == null) return Results.Problem("API services not available", statusCode: 503);
                if (req == null || req.RootElement.ValueKind != JsonValueKind.Object) return Results.BadRequest("Invalid request");
                if (!req.RootElement.TryGetProperty("paths", out var pathsElement) || pathsElement.ValueKind != JsonValueKind.Array)
                    return Results.BadRequest("Expected { paths: string[] }");

                var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var item in pathsElement.EnumerateArray())
                {
                    if (item.ValueKind != JsonValueKind.String) continue;
                    var p = item.GetString();
                    if (!string.IsNullOrWhiteSpace(p))
                        paths.Add(p.Trim());
                }

                var revision = Interlocked.Read(ref _nextRevision);
                var states = new List<object>();
                foreach (var p in paths)
                {
                    var li = services.GetItemByPath(p);
                    if (li == null) continue;
                    states.Add(new
                    {
                        itemId = li.FullPath,
                        isFavorite = li.IsFavorite,
                        isBlacklisted = li.IsBlacklisted,
                        revision
                    });
                }
                _log($"WebRemoteServer: Reconcile request for {paths.Count} path(s), returning {states.Count} state(s)");
                return Results.Json(states);
            });

            app.MapPost("/api/events/ack", (JsonDocument? req) =>
            {
                if (req == null || req.RootElement.ValueKind != JsonValueKind.Object)
                    return Results.BadRequest("Invalid request");
                if (!req.RootElement.TryGetProperty("clientId", out var cidElement) || cidElement.ValueKind != JsonValueKind.String)
                    return Results.BadRequest("Missing clientId");
                if (!req.RootElement.TryGetProperty("revision", out var revElement) || revElement.ValueKind != JsonValueKind.Number || !revElement.TryGetInt64(out var revision))
                    return Results.BadRequest("Missing revision");

                var clientId = cidElement.GetString()?.Trim();
                if (string.IsNullOrEmpty(clientId))
                    return Results.BadRequest("Invalid clientId");

                var now = DateTimeOffset.UtcNow;
                _clientAckState.AddOrUpdate(clientId,
                    _ => new ClientAckState(revision, now),
                    (_, old) => new ClientAckState(Math.Max(old.Revision, revision), now));
                var current = Interlocked.Read(ref _nextRevision);
                var lag = Math.Max(0, current - revision);
                _log($"WebRemoteServer: SSE ack client='{clientId}' rev={revision} lag={lag}");
                return Results.Ok();
            });

            app.MapPost("/api/events/client-log", (JsonDocument? req) =>
            {
                if (req == null || req.RootElement.ValueKind != JsonValueKind.Object)
                    return Results.BadRequest("Invalid request");

                var clientId = req.RootElement.TryGetProperty("clientId", out var cidElement) && cidElement.ValueKind == JsonValueKind.String
                    ? cidElement.GetString()
                    : "unknown";
                var level = req.RootElement.TryGetProperty("level", out var lvlElement) && lvlElement.ValueKind == JsonValueKind.String
                    ? lvlElement.GetString()
                    : "info";
                var message = req.RootElement.TryGetProperty("message", out var msgElement) && msgElement.ValueKind == JsonValueKind.String
                    ? msgElement.GetString()
                    : "client-log";
                var revision = req.RootElement.TryGetProperty("revision", out var revElement) && revElement.ValueKind == JsonValueKind.Number && revElement.TryGetInt64(out var rev)
                    ? rev.ToString()
                    : "-";
                var itemId = req.RootElement.TryGetProperty("itemId", out var itemElement) && itemElement.ValueKind == JsonValueKind.String
                    ? itemElement.GetString()
                    : "";

                _log($"WebRemoteServer: ClientLog [{level}] client='{clientId}' rev={revision} item='{itemId}' msg={message}");
                return Results.Ok();
            });

            app.MapGet("/api/events", async (HttpContext context) =>
            {
                var connectionId = Guid.NewGuid().ToString("N")[..8];
                var clientId = context.Request.Query["clientId"].ToString();
                if (string.IsNullOrWhiteSpace(clientId))
                    clientId = connectionId;
                long lastEventId = 0;
                var lastEventHeader = context.Request.Headers["Last-Event-ID"].ToString();
                if (!string.IsNullOrWhiteSpace(lastEventHeader))
                    long.TryParse(lastEventHeader, out lastEventId);
                var connectTime = DateTimeOffset.UtcNow;
                _clientAckState.AddOrUpdate(clientId,
                    _ => new ClientAckState(lastEventId, connectTime),
                    (_, old) => new ClientAckState(Math.Max(old.Revision, lastEventId), connectTime));
                var channel = Channel.CreateUnbounded<string>();
                _sseClients.TryAdd(channel.Writer, 0);
                try
                {
                    _log($"WebRemoteServer: SSE client connected [{connectionId}] client='{clientId}' lastEventId={lastEventId} activeClients={_sseClients.Count}");
                    context.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();
                    context.Response.ContentType = "text/event-stream";
                    context.Response.Headers.CacheControl = "no-cache, no-transform";
                    context.Response.Headers.Pragma = "no-cache";
                    context.Response.Headers.Connection = "keep-alive";
                    context.Response.Headers["X-Accel-Buffering"] = "no";
                    await context.Response.WriteAsync("retry: 1000\n\n", context.RequestAborted);
                    await context.Response.Body.FlushAsync(context.RequestAborted);

                    if (lastEventId > 0)
                    {
                        var missed = GetEventsAfter(lastEventId);
                        _log($"WebRemoteServer: SSE replay [{connectionId}] client='{clientId}' sending {missed.Count} missed event(s) after {lastEventId}");
                        foreach (var ev in missed)
                            await context.Response.WriteAsync(ev.Message, context.RequestAborted);
                        if (missed.Count > 0)
                            await context.Response.Body.FlushAsync(context.RequestAborted);
                    }

                    using var cts = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
                    while (!cts.Token.IsCancellationRequested)
                    {
                        try
                        {
                            var readTask = channel.Reader.ReadAsync(cts.Token).AsTask();
                            var delayTask = Task.Delay(10000, cts.Token);
                            var completed = await Task.WhenAny(readTask, delayTask);
                            if (completed == readTask)
                            {
                                var msg = await readTask;
                                await context.Response.WriteAsync(msg, cts.Token);
                            }
                            else
                            {
                                var pingPayload = JsonSerializer.Serialize(new
                                {
                                    ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                                });
                                await context.Response.WriteAsync($"event: ping\ndata: {pingPayload}\n\n", cts.Token);
                            }
                            await context.Response.Body.FlushAsync(cts.Token);
                        }
                        catch (OperationCanceledException) { break; }
                        catch (Exception ex)
                        {
                            _log($"WebRemoteServer: SSE loop error [{connectionId}] client='{clientId}' {ex.GetType().Name}: {ex.Message}");
                            break;
                        }
                    }
                }
                finally
                {
                    channel.Writer.Complete();
                    _sseClients.TryRemove(channel.Writer, out _);
                    _log($"WebRemoteServer: SSE client disconnected [{connectionId}] client='{clientId}' activeClients={_sseClients.Count}");
                }
            });

            app.MapGet("/api/media/{idOrToken}", (string idOrToken) =>
            {
                if (services == null || tokenStore == null)
                    return Results.Problem("API services not available", statusCode: 503);

                var fullPath = tokenStore.TryResolve(idOrToken);
                if (string.IsNullOrEmpty(fullPath))
                    fullPath = services.GetItemByPath(idOrToken)?.FullPath;

                if (string.IsNullOrEmpty(fullPath) || !System.IO.File.Exists(fullPath))
                    return Results.NotFound("Media not found");

                var contentType = MediaStreamer.GetContentType(fullPath);
                return Results.File(fullPath, contentType, enableRangeProcessing: true);
            });
        }

        /// <summary>
        /// Broadcasts a LibraryItemChanged event to all connected SSE clients.
        /// </summary>
        public void BroadcastLibraryItemChanged(string itemId, bool isFavorite, bool isBlacklisted)
        {
            var revision = Interlocked.Increment(ref _nextRevision);
            var payload = JsonSerializer.Serialize(new
            {
                itemId,
                isFavorite,
                isBlacklisted,
                revision
            });
            var msg = $"id: {revision}\ndata: {payload}\n\n";
            lock (_eventHistoryLock)
            {
                _eventHistory.Add(new SseSyncEvent(revision, msg, itemId, isFavorite, isBlacklisted, DateTimeOffset.UtcNow));
                if (_eventHistory.Count > MaxSyncEventHistory)
                    _eventHistory.RemoveRange(0, _eventHistory.Count - MaxSyncEventHistory);
            }
            var recipients = 0;
            foreach (var w in _sseClients.Keys)
            {
                try { if (w.TryWrite(msg)) recipients++; } catch { }
            }
            var pruned = PruneStaleAckClients();
            var ackSnapshot = _clientAckState.ToArray();
            if (ackSnapshot.Length == 0)
            {
                _log($"WebRemoteServer: Broadcast rev={revision} item='{itemId}' fav={isFavorite} blacklisted={isBlacklisted} recipients={recipients}/{_sseClients.Count} acks=none pruned={pruned}");
                return;
            }
            var lags = ackSnapshot.Select(kv => Math.Max(0, revision - kv.Value.Revision)).ToArray();
            var minLag = lags.Min();
            var maxLag = lags.Max();
            var avgLag = lags.Average();
            _log($"WebRemoteServer: Broadcast rev={revision} item='{itemId}' fav={isFavorite} blacklisted={isBlacklisted} recipients={recipients}/{_sseClients.Count} ackClients={ackSnapshot.Length} lag[min/avg/max]={minLag}/{avgLag:F1}/{maxLag} pruned={pruned}");
        }

        private List<SseSyncEvent> GetEventsAfter(long revision)
        {
            lock (_eventHistoryLock)
            {
                return _eventHistory.Where(e => e.Revision > revision).ToList();
            }
        }

        private int PruneStaleAckClients()
        {
            var cutoff = DateTimeOffset.UtcNow.AddMinutes(-2);
            var removed = 0;
            foreach (var kv in _clientAckState)
            {
                if (kv.Value.LastSeenUtc >= cutoff) continue;
                if (_clientAckState.TryRemove(kv.Key, out _))
                    removed++;
            }
            return removed;
        }

        private static FilterState CloneFilterState(FilterState source)
        {
            var clone = new FilterState
            {
                FavoritesOnly = source.FavoritesOnly,
                ExcludeBlacklisted = source.ExcludeBlacklisted,
                OnlyNeverPlayed = source.OnlyNeverPlayed,
                AudioFilter = source.AudioFilter,
                MinDuration = source.MinDuration,
                MaxDuration = source.MaxDuration,
                SelectedTags = source.SelectedTags != null ? new List<string>(source.SelectedTags) : new List<string>(),
                ExcludedTags = source.ExcludedTags != null ? new List<string>(source.ExcludedTags) : new List<string>(),
                TagMatchMode = source.TagMatchMode,
                MediaTypeFilter = source.MediaTypeFilter,
                OnlyKnownDuration = source.OnlyKnownDuration,
                OnlyKnownLoudness = source.OnlyKnownLoudness
            };
            if (source.CategoryLocalMatchModes != null)
                clone.CategoryLocalMatchModes = new Dictionary<string, TagMatchMode>(source.CategoryLocalMatchModes);
            clone.GlobalMatchMode = source.GlobalMatchMode;
            return clone;
        }

        /// <summary>
        /// Stops the HTTP server gracefully.
        /// </summary>
        public async Task StopAsync()
        {
            lock (_lock)
            {
                if (_app == null || _cts == null || _runTask == null)
                {
                    return;
                }

                try
                {
                    _cts.Cancel();
                }
                catch
                {
                    // Ignore
                }
            }

            try
            {
                if (_runTask != null)
                {
                    await _runTask.WaitAsync(TimeSpan.FromSeconds(5)).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException)
            {
                // Expected when stopping
            }
            catch (TimeoutException)
            {
                // Server didn't stop in time
            }
            finally
            {
                lock (_lock)
                {
                    StopMdnsAdvertisement();
                    _cts?.Dispose();
                    _cts = null;
                    _app?.DisposeAsync();
                    _app = null;
                    _runTask = null;
                }
            }
        }

        public void Dispose()
        {
            if (_disposed) return;
            StopAsync().GetAwaiter().GetResult();
            _disposed = true;
            GC.SuppressFinalize(this);
        }

        private void StartMdnsAdvertisement(string lanHostname, int port)
        {
            try
            {
                StopMdnsAdvertisement();
                var hostLabel = NormalizeMdnsHostLabel(lanHostname);
                var hostFqdn = new DomainName($"{hostLabel}.local");
                var addresses = MulticastService.GetLinkLocalAddresses()
                    .Where(a => a.AddressFamily == AddressFamily.InterNetwork || a.AddressFamily == AddressFamily.InterNetworkV6)
                    .ToArray();

                _mdnsProfile = new ServiceProfile("ReelRoulette", "_http._tcp", (ushort)port, addresses);
                _mdnsProfile.HostName = hostFqdn;
                foreach (var srv in _mdnsProfile.Resources.OfType<SRVRecord>())
                    srv.Target = hostFqdn;
                foreach (var addr in _mdnsProfile.Resources.OfType<AddressRecord>())
                    addr.Name = hostFqdn;
                _mdnsProfile.AddProperty("path", "/");
                _mdnsProfile.AddProperty("host", $"{hostLabel}.local");

                _mdns = new ServiceDiscovery();
                _mdns.Advertise(_mdnsProfile);
                _mdns.Announce(_mdnsProfile);
                _log($"WebRemoteServer: mDNS advertised at http://{hostLabel}.local:{port}/");
            }
            catch (Exception ex)
            {
                _log($"WebRemoteServer: mDNS advertise failed ({ex.GetType().Name}): {ex.Message}");
                StopMdnsAdvertisement();
            }
        }

        private void StopMdnsAdvertisement()
        {
            try
            {
                if (_mdns != null && _mdnsProfile != null)
                    _mdns.Unadvertise(_mdnsProfile);
            }
            catch (Exception ex)
            {
                _log($"WebRemoteServer: mDNS unadvertise failed ({ex.GetType().Name}): {ex.Message}");
            }
            finally
            {
                _mdnsProfile = null;
                _mdns?.Dispose();
                _mdns = null;
            }
        }

        private static string NormalizeMdnsHostLabel(string? value)
        {
            var raw = string.IsNullOrWhiteSpace(value) ? "reel" : value.Trim().ToLowerInvariant();
            var chars = raw.Where(c => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-').ToArray();
            var normalized = new string(chars).Trim('-');
            if (string.IsNullOrWhiteSpace(normalized))
                return "reel";
            if (normalized.Length > 63)
                normalized = normalized.Substring(0, 63).Trim('-');
            return string.IsNullOrWhiteSpace(normalized) ? "reel" : normalized;
        }

        private static bool CanBindTcpPort(int port, IPAddress ip)
        {
            try
            {
                using var socket = new Socket(ip.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
                socket.Bind(new IPEndPoint(ip, port));
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
