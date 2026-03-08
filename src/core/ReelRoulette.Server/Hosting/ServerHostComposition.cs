using System.Text.Json;
using System.Net;
using Microsoft.AspNetCore.StaticFiles;
using ReelRoulette.Server.Auth;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Server.Hosting;

public static class ServerHostComposition
{
    public const string WebClientCorsPolicyName = "ReelRouletteWebClient";
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();

    public static void AddReelRouletteServer(this IServiceCollection services)
    {
        services.AddSingleton(sp =>
        {
            var logger = sp.GetRequiredService<ILogger<ServerStateService>>();
            var appDataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
            return new ServerStateService(logger, appDataRoot);
        });
        services.AddSingleton(sp =>
        {
            var logger = sp.GetRequiredService<ILogger<CoreSettingsService>>();
            var options = sp.GetRequiredService<ServerRuntimeOptions>();
            var appDataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
            return new CoreSettingsService(logger, options, appDataRoot);
        });
        services.AddSingleton<ServerMediaTokenStore>();
        services.AddSingleton<LibraryPlaybackService>();
        services.AddSingleton<RefreshPipelineService>();
        services.AddSingleton<LibraryOperationsService>();
        services.AddSingleton<ServerSessionStore>();
        services.AddSingleton<ApiTelemetryService>();
        services.AddHostedService(sp => sp.GetRequiredService<RefreshPipelineService>());
    }

    public static void MapReelRouletteEndpoints(this WebApplication app, ServerRuntimeOptions options)
    {
        app.Use(async (context, next) =>
        {
            var path = context.Request.Path.Value ?? string.Empty;
            var isApiRequest = path.StartsWith("/api", StringComparison.OrdinalIgnoreCase);
            var isControlRequest = path.StartsWith("/control", StringComparison.OrdinalIgnoreCase);
            if (isApiRequest || isControlRequest)
            {
                var telemetry = context.RequestServices.GetRequiredService<ApiTelemetryService>();
                telemetry.RecordIncoming(context.Request.Method, path);
                await next();
                telemetry.RecordOutgoing(context.Request.Method, path, context.Response.StatusCode);
                return;
            }

            await next();
        });

        if (options.EnableCors)
        {
            app.UseCors(WebClientCorsPolicyName);
        }

        if (options.RequireAuth)
        {
            app.Use((context, next) =>
            {
                var sessions = context.RequestServices.GetRequiredService<ServerSessionStore>();
                var settings = context.RequestServices.GetRequiredService<CoreSettingsService>();
                return new ServerPairingAuthMiddleware(next, options, sessions, settings).InvokeAsync(context);
            });
        }

        app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

        app.MapGet("/api/pair", (HttpContext context, string? token, ServerSessionStore sessions) =>
        {
            return HandlePairRequest(context, token, options, sessions);
        });

        app.MapPost("/api/pair", (HttpContext context, PairRequest? request, ServerSessionStore sessions) =>
        {
            return HandlePairRequest(context, request?.Token, options, sessions);
        });

        app.MapGet("/control/pair", (HttpContext context, string? token, ServerSessionStore sessions, CoreSettingsService settings) =>
        {
            return HandleControlPairRequest(context, token, options, settings, sessions);
        });

        app.MapPost("/control/pair", (HttpContext context, PairRequest? request, ServerSessionStore sessions, CoreSettingsService settings) =>
        {
            return HandleControlPairRequest(context, request?.Token, options, settings, sessions);
        });

        app.MapGet("/api/version", (ServerStateService state) =>
        {
            return Results.Ok(state.GetVersion());
        });

        app.MapGet("/api/capabilities", (ServerStateService state) =>
        {
            return Results.Ok(new
            {
                capabilities = state.GetVersion().Capabilities
            });
        });

        app.MapGet("/control/status", (ServerRuntimeOptions runtime, CoreSettingsService settings, ServerSessionStore sessions, ServerStateService state, ApiTelemetryService telemetry) =>
        {
            var webSettings = settings.GetWebRuntimeSettings();
            var connected = new ConnectedClientsSnapshot
            {
                ApiPairedSessions = sessions.GetActiveSessionCount(ServerSessionStore.ApiScope, DateTimeOffset.UtcNow),
                ControlPairedSessions = sessions.GetActiveSessionCount(ServerSessionStore.ControlScope, DateTimeOffset.UtcNow),
                SseSubscribers = state.GetSubscriberCount()
            };

            return Results.Ok(new ControlStatusResponse
            {
                ServerTimeUtc = DateTimeOffset.UtcNow,
                IsHealthy = true,
                ListenUrl = runtime.ListenUrl,
                LanExposed = webSettings.BindOnLan,
                ConnectedClients = connected,
                IncomingApiEvents = telemetry.GetIncoming(100),
                OutgoingApiEvents = telemetry.GetOutgoing(100)
            });
        });

        app.MapGet("/control/settings", (CoreSettingsService settings) =>
        {
            return Results.Ok(settings.GetControlRuntimeSettings());
        });

        app.MapPost("/control/settings", (ControlRuntimeSettingsSnapshot snapshot, CoreSettingsService settings) =>
        {
            var (appliedSettings, applyResult) = settings.UpdateControlRuntimeSettings(snapshot);
            return Results.Ok(new
            {
                settings = appliedSettings,
                result = applyResult
            });
        });

        app.MapGet("/api/presets", (ServerStateService state, LibraryPlaybackService playback) =>
        {
            return Results.Ok(playback.GetPresets(state.GetPresetCatalogSnapshot()));
        });

        app.MapGet("/api/sources", (ServerStateService state) =>
        {
            return Results.Ok(state.GetSourcesSnapshot());
        });

        app.MapPost("/api/sources/import", (SourceImportRequest request, LibraryOperationsService operations) =>
        {
            var response = operations.ImportSource(request);
            if (!response.Accepted)
            {
                return Results.BadRequest(new { error = response.Message });
            }

            return Results.Ok(response);
        });

        app.MapGet("/api/library/projection", (LibraryOperationsService operations) =>
        {
            return Results.Json(operations.GetLibraryProjection());
        });

        app.MapPost("/api/sources/{sourceId}/enabled", (string sourceId, UpdateSourceEnabledRequest request, ServerStateService state) =>
        {
            if (string.IsNullOrWhiteSpace(sourceId))
            {
                return Results.BadRequest(new { error = "sourceId is required" });
            }

            if (!state.TrySetSourceEnabled(sourceId, request.IsEnabled, out var source) || source == null)
            {
                return Results.NotFound(new { error = "source not found" });
            }

            return Results.Ok(source);
        });

        app.MapPost("/api/presets", (List<FilterPresetSnapshot>? presets, ServerStateService state) =>
        {
            state.SetPresetCatalog(presets ?? []);
            return Results.Ok();
        });

        app.MapPost("/api/presets/match", (PresetMatchRequest request, ServerStateService state, LibraryPlaybackService playback) =>
        {
            if (!playback.TryMatchPreset(request, state.GetPresetCatalogSnapshot(), out var response, out var statusCode, out var error))
            {
                return Results.Json(new { error }, statusCode: statusCode);
            }

            return Results.Ok(response);
        });

        app.MapPost("/api/random", (RandomRequest request, ServerStateService state, LibraryPlaybackService playback) =>
        {
            if (!playback.TrySelectRandom(
                    request,
                    state.GetPresetCatalogSnapshot(),
                    state.GetTagCategoriesSnapshot(),
                    state.GetTagsSnapshot(),
                    out var response,
                    out var statusCode,
                    out var error))
            {
                return Results.Json(new { error }, statusCode: statusCode);
            }

            if (response is null)
            {
                return Results.Json(new { });
            }

            return Results.Ok(response);
        });

        app.MapGet("/api/media/{idOrToken}", (string idOrToken, LibraryPlaybackService playback) =>
        {
            if (!playback.TryResolveMediaPath(idOrToken, out var fullPath) || !File.Exists(fullPath))
            {
                return Results.NotFound("Media not found");
            }

            var contentType = ContentTypeProvider.TryGetContentType(fullPath, out var resolvedType)
                ? resolvedType
                : "application/octet-stream";
            return Results.File(fullPath, contentType, enableRangeProcessing: true);
        });

        app.MapPost("/api/favorite", (FavoriteRequest request, ServerStateService state) =>
        {
            if (string.IsNullOrWhiteSpace(request.Path))
            {
                return Results.BadRequest(new { error = "path is required" });
            }

            state.SetFavorite(request);
            return Results.Ok();
        });

        app.MapPost("/api/blacklist", (BlacklistRequest request, ServerStateService state) =>
        {
            if (string.IsNullOrWhiteSpace(request.Path))
            {
                return Results.BadRequest(new { error = "path is required" });
            }

            state.SetBlacklist(request);
            return Results.Ok();
        });

        app.MapPost("/api/record-playback", (RecordPlaybackRequest request, ServerStateService state) =>
        {
            if (string.IsNullOrWhiteSpace(request.Path))
            {
                return Results.BadRequest(new { error = "path is required" });
            }

            state.RecordPlayback(request);
            return Results.Ok();
        });

        app.MapPost("/api/playback/clear-stats", (ClearPlaybackStatsRequest request, LibraryOperationsService operations) =>
        {
            return Results.Ok(operations.ClearPlaybackStats(request));
        });

        app.MapPost("/api/library-states", (LibraryStatesRequest request, ServerStateService state) =>
        {
            var states = state.GetLibraryStates(request);
            return Results.Ok(states);
        });

        app.MapPost("/api/tag-editor/model", (TagEditorModelRequest request, ServerStateService state) =>
        {
            var model = state.GetTagEditorModel(request);
            return Results.Ok(model);
        });

        app.MapPost("/api/tag-editor/apply-item-tags", (ApplyItemTagsRequest request, ServerStateService state) =>
        {
            if (request.ItemIds.Count == 0)
            {
                return Results.BadRequest(new { error = "itemIds must contain at least one id" });
            }

            state.ApplyItemTags(request);
            return Results.Ok();
        });

        app.MapPost("/api/tag-editor/upsert-category", (UpsertCategoryRequest request, ServerStateService state) =>
        {
            if (string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "id and name are required" });
            }

            state.UpsertCategory(request);
            return Results.Ok();
        });

        app.MapPost("/api/tag-editor/upsert-tag", (UpsertTagRequest request, ServerStateService state) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "name is required" });
            }

            state.UpsertTag(request);
            return Results.Ok();
        });

        app.MapPost("/api/tag-editor/rename-tag", (RenameTagRequest request, ServerStateService state) =>
        {
            if (string.IsNullOrWhiteSpace(request.OldName) || string.IsNullOrWhiteSpace(request.NewName))
            {
                return Results.BadRequest(new { error = "oldName and newName are required" });
            }

            state.RenameTag(request);
            return Results.Ok();
        });

        app.MapPost("/api/tag-editor/delete-tag", (DeleteTagRequest request, ServerStateService state) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "name is required" });
            }

            state.DeleteTag(request);
            return Results.Ok();
        });

        app.MapPost("/api/tag-editor/delete-category", (DeleteCategoryRequest request, ServerStateService state) =>
        {
            if (string.IsNullOrWhiteSpace(request.CategoryId))
            {
                return Results.BadRequest(new { error = "categoryId is required" });
            }

            state.DeleteCategory(request);
            return Results.Ok();
        });

        app.MapPost("/api/tag-editor/sync-catalog", (SyncTagCatalogRequest request, ServerStateService state) =>
        {
            state.SyncTagCatalog(request);
            return Results.Ok();
        });

        app.MapPost("/api/tag-editor/sync-item-tags", (SyncItemTagsRequest request, ServerStateService state) =>
        {
            state.SyncItemTags(request);
            return Results.Ok();
        });

        app.MapPost("/api/refresh/start", (RefreshStartRequest? request, RefreshPipelineService refresh) =>
        {
            var response = refresh.TryStartManual();
            if (!response.Accepted)
            {
                return Results.Json(new { error = "already running", runId = response.RunId }, statusCode: StatusCodes.Status409Conflict);
            }

            return Results.Ok(response);
        });

        app.MapGet("/api/refresh/status", (RefreshPipelineService refresh) =>
        {
            return Results.Ok(refresh.GetStatus());
        });

        app.MapGet("/api/refresh/settings", (CoreSettingsService settings) =>
        {
            return Results.Ok(settings.GetRefreshSettings());
        });

        app.MapPost("/api/refresh/settings", (RefreshSettingsSnapshot snapshot, CoreSettingsService settings) =>
        {
            return Results.Ok(settings.UpdateRefreshSettings(snapshot));
        });

        app.MapPost("/api/duplicates/scan", (DuplicateScanRequest request, LibraryOperationsService operations) =>
        {
            return Results.Ok(operations.ScanDuplicates(request));
        });

        app.MapPost("/api/duplicates/apply", (DuplicateApplyRequest request, LibraryOperationsService operations) =>
        {
            return Results.Ok(operations.ApplyDuplicateSelection(request));
        });

        app.MapPost("/api/autotag/scan", (AutoTagScanRequest request, LibraryOperationsService operations) =>
        {
            return Results.Ok(operations.ScanAutoTags(request));
        });

        app.MapPost("/api/autotag/apply", (AutoTagApplyRequest request, LibraryOperationsService operations, ServerStateService state) =>
        {
            foreach (var assignment in request.Assignments)
            {
                if (string.IsNullOrWhiteSpace(assignment.TagName) || assignment.ItemPaths.Count == 0)
                {
                    continue;
                }

                state.ApplyItemTags(new ApplyItemTagsRequest
                {
                    ItemIds = assignment.ItemPaths,
                    AddTags = [assignment.TagName],
                    RemoveTags = []
                });
            }

            return Results.Ok(operations.ApplyAutoTags(request));
        });

        app.MapPost("/api/logs/client", (ClientLogRequest request, LibraryOperationsService operations) =>
        {
            operations.AppendClientLog(request);
            return Results.Ok(new { accepted = true });
        });

        app.MapGet("/api/web-runtime/settings", (CoreSettingsService settings) =>
        {
            return Results.Ok(settings.GetWebRuntimeSettings());
        });

        app.MapPost("/api/web-runtime/settings", (WebRuntimeSettingsSnapshot snapshot, CoreSettingsService settings) =>
        {
            return Results.Ok(settings.UpdateWebRuntimeSettings(snapshot));
        });

        app.MapGet("/api/thumbnail/{itemId}", (string itemId, RefreshPipelineService refresh) =>
        {
            if (string.IsNullOrWhiteSpace(itemId))
            {
                return Results.BadRequest(new { error = "itemId is required" });
            }

            var path = refresh.GetThumbnailPath(itemId);
            if (!File.Exists(path))
            {
                return Results.NotFound();
            }

            return Results.File(path, "image/jpeg");
        });

        app.MapGet("/api/events", async (HttpContext context, ServerStateService state) =>
        {
            context.Response.Headers.Append("Content-Type", "text/event-stream");
            context.Response.Headers.Append("Cache-Control", "no-cache");
            context.Response.Headers.Append("Connection", "keep-alive");

            var cancellationToken = context.RequestAborted;
            var serializerOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
            var lastEventHeader = context.Request.Headers["Last-Event-ID"].ToString();
            var lastEventQuery = context.Request.Query["lastEventId"].ToString();
            var hasLastEvent = long.TryParse(lastEventHeader, out var lastEventRevision) ||
                               long.TryParse(lastEventQuery, out lastEventRevision);
            long lastDeliveredRevision = 0;

            await context.Response.WriteAsync("retry: 1000\n\n", cancellationToken);
            await context.Response.Body.FlushAsync(cancellationToken);

            var reader = state.Subscribe(cancellationToken);
            if (hasLastEvent)
            {
                var replay = state.GetReplayAfter(lastEventRevision);
                if (replay.GapDetected)
                {
                    var resyncEnvelope = state.CreateEnvelope(
                        "resyncRequired",
                        new
                        {
                            reason = "revisionGap",
                            lastEventId = lastEventRevision,
                            currentRevision = replay.CurrentRevision
                        });
                    await WriteSseEnvelopeAsync(context, resyncEnvelope, serializerOptions, cancellationToken);
                    lastDeliveredRevision = resyncEnvelope.Revision;
                }

                foreach (var missedEvent in replay.Events)
                {
                    await WriteSseEnvelopeAsync(context, missedEvent, serializerOptions, cancellationToken);
                    lastDeliveredRevision = Math.Max(lastDeliveredRevision, missedEvent.Revision);
                }
            }

            while (await reader.WaitToReadAsync(cancellationToken))
            {
                while (reader.TryRead(out var envelope))
                {
                    if (envelope.Revision <= lastDeliveredRevision)
                    {
                        continue;
                    }

                    await WriteSseEnvelopeAsync(context, envelope, serializerOptions, cancellationToken);
                    lastDeliveredRevision = envelope.Revision;
                }
            }
        });
    }

    private static IResult HandlePairRequest(
        HttpContext context,
        string? token,
        ServerRuntimeOptions options,
        ServerSessionStore sessions)
    {
        if (!options.RequireAuth || string.IsNullOrEmpty(options.PairingToken))
        {
            return Results.Ok(new { paired = true, message = "Auth disabled" });
        }

        var effectiveToken = token ?? context.Request.Query["token"].ToString();
        if (string.IsNullOrEmpty(effectiveToken) ||
            !string.Equals(effectiveToken, options.PairingToken, StringComparison.Ordinal))
        {
            return Results.Json(new { error = "Unauthorized" }, statusCode: StatusCodes.Status401Unauthorized);
        }

        var sessionId = sessions.CreateSession(
            DateTimeOffset.UtcNow,
            TimeSpan.FromHours(options.PairingSessionDurationHours));

        context.Response.Cookies.Append(
            options.PairingCookieName,
            sessionId,
            PairingCookiePolicy.BuildCookieOptions(options, context.Request.IsHttps));

        return Results.Ok(new { paired = true, message = "Paired successfully" });
    }

    private static IResult HandleControlPairRequest(
        HttpContext context,
        string? token,
        ServerRuntimeOptions options,
        CoreSettingsService settings,
        ServerSessionStore sessions)
    {
        if (!IsLocalRequest(context) && !settings.GetWebRuntimeSettings().BindOnLan)
        {
            return Results.Json(new { error = "Forbidden. Control-plane LAN access is disabled." }, statusCode: StatusCodes.Status403Forbidden);
        }

        var control = settings.GetControlRuntimeSettings();
        if (!string.Equals(control.AdminAuthMode, "TokenRequired", StringComparison.OrdinalIgnoreCase))
        {
            return Results.Ok(new { paired = true, message = "Control admin auth disabled" });
        }

        var effectiveToken = token ?? context.Request.Query["token"].ToString();
        if (string.IsNullOrWhiteSpace(control.AdminSharedToken) ||
            string.IsNullOrWhiteSpace(effectiveToken) ||
            !string.Equals(control.AdminSharedToken, effectiveToken, StringComparison.Ordinal))
        {
            return Results.Json(new { error = "Unauthorized" }, statusCode: StatusCodes.Status401Unauthorized);
        }

        var sessionId = sessions.CreateSession(
            ServerSessionStore.ControlScope,
            DateTimeOffset.UtcNow,
            TimeSpan.FromHours(options.PairingSessionDurationHours));

        context.Response.Cookies.Append(
            options.ControlAdminCookieName,
            sessionId,
            PairingCookiePolicy.BuildCookieOptions(options, context.Request.IsHttps));

        return Results.Ok(new { paired = true, message = "Control paired successfully" });
    }

    private static async Task WriteSseEnvelopeAsync(
        HttpContext context,
        ServerEventEnvelope envelope,
        JsonSerializerOptions serializerOptions,
        CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(envelope, serializerOptions);
        var telemetry = context.RequestServices.GetRequiredService<ApiTelemetryService>();
        telemetry.RecordOutgoingServerEvent(envelope.EventType);
        await context.Response.WriteAsync($"id: {envelope.Revision}\n", cancellationToken);
        await context.Response.WriteAsync($"event: {envelope.EventType}\n", cancellationToken);
        await context.Response.WriteAsync($"data: {json}\n\n", cancellationToken);
        await context.Response.Body.FlushAsync(cancellationToken);
    }

    private static bool IsLocalRequest(HttpContext context)
    {
        var remote = context.Connection.RemoteIpAddress;
        if (remote is null)
        {
            return true;
        }

        return IPAddress.IsLoopback(remote) || remote.Equals(context.Connection.LocalIpAddress);
    }
}
