using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Net.Http.Headers;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Auth;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Server.Hosting;

public static class ServerHostComposition
{
    internal const string ShowInFileManagerCapability = "api.showInFileManager";
    internal const string FileManagerErrorNotLocal = "file_manager_not_local";
    internal const string FileManagerErrorUnavailable = "file_manager_unavailable";
    internal const string FileManagerErrorItemNotFound = "file_manager_item_not_found";
    internal const string FileManagerErrorFileMissing = "file_manager_file_missing";
    internal const string FileManagerErrorFailed = "file_manager_failed";
    internal const string ErrorControlTokenRequired = "control_token_required";

    /// <summary>The reason a route that deletes files gives a caller the <c>/control</c> routes don't accept.</summary>
    internal const string FileDeletionNeedsControlToken = "Deleting files is an admin action, which needs the server's control token.";
    internal const string BulkFlagFavorite = "favorite";
    internal const string BulkFlagBlacklist = "blacklist";

    /// <summary>The reason for a 404 about an item id the catalog doesn't hold, as after a refresh removed its file.</summary>
    internal const string ItemNotInLibrary = "The file is no longer in the library.";
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();

    public static void AddReelRouletteServer(this IServiceCollection services)
    {
        services.AddSingleton(sp => OpenLibraryCatalog(
            ServerDataPaths.DataDirectory(),
            sp.GetRequiredService<ILogger<LibraryCatalogHost>>()));
        services.AddSingleton(sp =>
        {
            var logger = sp.GetRequiredService<ILogger<ServerStateService>>();
            var catalog = sp.GetRequiredService<LibraryCatalogHost>();
            return new ServerStateService(logger, catalog.HasLibrary ? catalog : null, sp.GetRequiredService<ServerLogService>());
        });
        services.AddSingleton(sp =>
        {
            var options = sp.GetRequiredService<ServerRuntimeOptions>();
            var appDataRoot = ServerDataPaths.DataDirectory();
            return new CoreSettingsService(options, appDataRoot);
        });
        services.AddSingleton<ServerMediaTokenStore>();
        services.AddSingleton<LibraryPlaybackService>();
        services.AddSingleton<RefreshPipelineService>();
        services.AddSingleton<LibraryOperationsService>();
        services.AddSingleton<ServerSessionStore>();
        services.AddSingleton<ApiTelemetryService>();
        services.AddSingleton<ConnectedClientTracker>();
        services.AddSingleton<OperatorTestingService>();
        services.AddSingleton(_ => new ServerLogService());
        services.AddHostedService(sp => sp.GetRequiredService<RefreshPipelineService>());
    }

    /// <summary>
    /// Opens the catalog as the server starts: logs the outcome and, with a library, attaches the catalog
    /// backup, which takes a startup backup and backs up after each catalog write.
    /// </summary>
    internal static LibraryCatalogHost OpenLibraryCatalog(string appDataRoot, ILogger logger)
    {
        var host = LibraryCatalogHost.Open(appDataRoot);
        if (!host.HasLibrary)
        {
            // No backup is attached, so neither a backup nor rotation runs against these files.
            logger.LogWarning("Running without a library: {Reason}", host.UnavailableMessage);
            new ServerLogService(appDataRoot, logger).Append("warn", host.UnavailableMessage!);
            return host;
        }

        logger.LogInformation(
            "Opened library catalog {DatabasePath}.",
            host.Session.DatabasePath);
        if (host.MigrationMessage != null)
        {
            logger.LogInformation("{Message}", host.MigrationMessage);
            new ServerLogService(appDataRoot, logger).Append("info", host.MigrationMessage);
        }

        LibraryCatalogBackup.Attach(host.Session, appDataRoot, logger);
        return host;
    }

    /// <summary>The steps every request passes before its endpoint, in order.</summary>
    internal static void UseRequestPipeline(IApplicationBuilder app, ServerRuntimeOptions options)
    {
        // First, so every later step sees the client's address, scheme, and host from a proxy on this machine.
        var proxyForwarding = new ProxyForwarding(app.ApplicationServices.GetRequiredService<ServerLogService>());
        app.Use((context, next) =>
        {
            proxyForwarding.WarnIfUntrusted(context);
            return next(context);
        });
        app.UseForwardedHeaders(ProxyForwarding.CreateOptions());

        // Next, ahead of telemetry, so nothing else answers a device that remote connections refuse.
        app.Use(async (context, next) =>
        {
            var settings = context.RequestServices.GetRequiredService<CoreSettingsService>();
            if (RemoteConnectionsGate.Refuses(context, settings))
            {
                await RemoteConnectionsGate.WriteRefusalAsync(context);
                return;
            }

            await next();
        });

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

        app.Use(async (context, next) =>
        {
            var path = context.Request.Path.Value ?? string.Empty;
            var isApiRequest = path.StartsWith("/api", StringComparison.OrdinalIgnoreCase);
            if (!isApiRequest)
            {
                await next();
                return;
            }

            if (path.StartsWith("/api/version", StringComparison.OrdinalIgnoreCase) ||
                path.StartsWith("/api/capabilities", StringComparison.OrdinalIgnoreCase) ||
                path.StartsWith("/api/pair", StringComparison.OrdinalIgnoreCase))
            {
                await next();
                return;
            }

            var testing = context.RequestServices.GetRequiredService<OperatorTestingService>().GetSnapshot();
            if (testing.TestingModeEnabled && testing.ForceApiUnavailable)
            {
                context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                await context.Response.WriteAsJsonAsync(new { error = "Testing mode: API unavailable simulation active." });
                return;
            }

            await next();
        });

        // Installed whether or not API pairing is required: the control plane always needs it.
        app.Use((context, next) =>
        {
            var sessions = context.RequestServices.GetRequiredService<ServerSessionStore>();
            var settings = context.RequestServices.GetRequiredService<CoreSettingsService>();
            return new ServerPairingAuthMiddleware(next, options, sessions, settings).InvokeAsync(context);
        });

        // After pairing, so a caller that is not paired still gets 401 rather than the library state.
        app.Use(async (context, next) =>
        {
            var catalog = context.RequestServices.GetRequiredService<LibraryCatalogHost>();
            var refusal = LibraryRouteGate.Refusal(context.Request.Path, catalog);
            if (refusal == null)
            {
                await next();
                return;
            }

            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsJsonAsync(new { error = refusal.Error, code = refusal.Code });
        });
    }

    public static void MapReelRouletteEndpoints(this WebApplication app, ServerRuntimeOptions options)
    {
        UseRequestPipeline(app, options);

        app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

        app.MapGet("/api/pair", (HttpContext context, string? token, ServerSessionStore sessions) =>
        {
            return HandlePairRequest(context, token, options, sessions);
        });

        app.MapPost("/api/pair", (HttpContext context, PairRequest? request, ServerSessionStore sessions) =>
        {
            return HandlePairRequest(context, request?.Token, options, sessions);
        });

        app.MapPost("/control/pair", (HttpContext context, PairRequest? request, ServerSessionStore sessions, CoreSettingsService settings, ServerLogService logs) =>
        {
            return HandleControlPairRequest(context, request?.Token, options, settings, sessions, logs);
        });

        // The /control gate answers 401 to a caller it doesn't accept, so reaching this means the caller may do admin actions.
        app.MapGet("/control/access", GetControlAccess);

        app.MapGet("/api/version", GetVersion);

        app.MapGet("/api/capabilities", GetCapabilities);

        app.MapGet("/control/status", (ServerRuntimeOptions runtime, CoreSettingsService settings, ServerSessionStore sessions, ServerStateService state, ApiTelemetryService telemetry, ConnectedClientTracker clients, OperatorTestingService testingService, LibraryCatalogHost catalog) =>
        {
            var webSettings = settings.GetWebRuntimeSettings();
            var nowUtc = DateTimeOffset.UtcNow;
            var apiSessions = sessions.GetActiveSessions(ServerSessionStore.ApiScope, nowUtc);
            var controlSessions = sessions.GetActiveSessions(ServerSessionStore.ControlScope, nowUtc);
            var activeSseClients = clients.GetActiveSseClients();
            var connected = new ConnectedClientsSnapshot
            {
                ApiPairedSessions = apiSessions.Count,
                ControlPairedSessions = controlSessions.Count,
                SseSubscribers = activeSseClients.Count,
                ApiSessions = apiSessions.Select(MapSessionSnapshot).ToList(),
                ControlSessions = controlSessions.Select(MapSessionSnapshot).ToList(),
                ActiveSseClients = activeSseClients.ToList()
            };

            return Results.Ok(new ControlStatusResponse
            {
                ServerTimeUtc = nowUtc,
                IsHealthy = true,
                ListenUrl = runtime.ListenUrl,
                LanExposed = webSettings.BindOnLan,
                ConnectedClients = connected,
                IncomingApiEvents = telemetry.GetIncoming(100),
                OutgoingApiEvents = telemetry.GetOutgoing(100),
                Testing = testingService.GetSnapshot(),
                LibraryState = catalog.StateName,
                LibraryMessage = catalog.UnavailableMessage
            });
        });

        app.MapGet("/control/settings", (CoreSettingsService settings) =>
        {
            return Results.Ok(settings.GetControlRuntimeSettings());
        });

        app.MapPost("/control/settings", (HttpContext context, ControlRuntimeSettingsSnapshot snapshot, CoreSettingsService settings, ServerSessionStore sessions) =>
        {
            return UpdateControlSettings(context, snapshot, options, settings, sessions);
        });

        app.MapGet("/control/logs/server", (int? tail, string? contains, string? level, ServerLogService logs) =>
        {
            var response = logs.Read(tail ?? 200, contains, level);
            return Results.Ok(response);
        });

        app.MapGet("/control/testing", (OperatorTestingService testingService) =>
        {
            return Results.Ok(testingService.GetSnapshot());
        });

        app.MapPost("/control/testing/update", UpdateTesting);

        app.MapPost("/control/testing/reset", ResetTesting);

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

        app.MapPost("/api/library/item", ReadLibraryItem);

        app.MapPost("/api/library/query", (LibraryQueryRequest? request, LibraryOperationsService operations, RefreshPipelineService refresh) =>
        {
            var outcome = operations.QueryLibrary(request, refresh.EnrichListedItems);
            if (!outcome.Accepted || outcome.Body == null)
            {
                return Results.BadRequest(new { error = outcome.Error ?? "Invalid library query" });
            }

            return Results.Json(outcome.Body);
        });

        app.MapPost("/api/library/query-ids", QueryLibraryIds);

        app.MapPost("/api/library/delete-files", DeleteFiles);

        app.MapGet("/api/library/stats", (LibraryOperationsService operations) =>
        {
            return Results.Ok(operations.GetLibraryStats());
        });

        app.MapGet("/api/library/catalog-checkpoint", (LibraryOperationsService operations) =>
        {
            var temp = Path.Combine(Path.GetTempPath(), "rr-checkpoint-" + Guid.NewGuid().ToString("N") + ".db");
            try
            {
                operations.WriteCatalogCheckpoint(temp);
                var stream = new FileStream(temp, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.DeleteOnClose);
                return Results.Stream(stream, "application/octet-stream", "library.db");
            }
            catch (Exception ex)
            {
                if (File.Exists(temp))
                {
                    File.Delete(temp);
                }

                return Results.Problem(ex.Message);
            }
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

        app.MapPost("/api/presets/create", CreatePreset);

        app.MapPost("/api/presets/{presetId}/update", UpdatePreset);

        app.MapPost("/api/presets/{presetId}/rename", RenamePreset);

        app.MapPost("/api/presets/reorder", ReorderPresets);

        app.MapPost("/api/presets/{presetId}/delete", DeletePreset);

        app.MapPost("/api/random", (RandomRequest request, ServerStateService state, LibraryPlaybackService playback) =>
            playback.TrySelectRandom(request, state.GetPresetCatalogSnapshot(), out var response, out var statusCode, out var error)
                ? Results.Ok(response)
                : Results.Json(new { error }, statusCode: statusCode));

        app.MapPost("/api/random/cycle", (RandomRequest request, ServerStateService state, LibraryPlaybackService playback) =>
            playback.TryGetRandomCycle(request, state.GetPresetCatalogSnapshot(), out var response, out var statusCode, out var error)
                ? Results.Ok(response)
                : Results.Json(new { error }, statusCode: statusCode));

        app.MapPost("/api/random/reset", (RandomResetRequest? request, LibraryPlaybackService playback) =>
        {
            playback.ResetRandom(request?.ClientId);
            return Results.NoContent();
        });

        app.MapPost("/api/play/{itemId}", PlayItem);

        app.MapPost("/api/show-in-file-manager/{itemId}", ShowInFileManager);

        app.MapGet("/api/media/{token}", (HttpContext context, string token, LibraryPlaybackService playback, OperatorTestingService testingService, IHostApplicationLifetime lifetime) =>
            ServeMedia(context, token, playback, testingService, lifetime.ApplicationStopping));

        app.MapPost("/api/favorite", SetFavorite);

        app.MapPost("/api/blacklist", SetBlacklist);

        app.MapPost("/api/rating", SetRating);

        app.MapPost("/api/bulk/item-state", SetBulkItemState);

        app.MapPost("/api/bulk/rating", SetBulkRating);

        app.MapPost("/api/record-playback", RecordPlayback);

        app.MapPost("/api/playback/clear-stats", ClearPlaybackStats);

        app.MapPost("/api/tag-editor/model", (TagEditorModelRequest request, LibraryOperationsService operations) =>
        {
            var model = operations.GetTagEditorModel(request);
            return Results.Ok(model);
        });

        app.MapPost("/api/tag-editor/apply-item-tags", ApplyItemTags);

        app.MapPost("/api/tag-editor/upsert-category", UpsertCategory);

        app.MapPost("/api/tag-editor/upsert-tag", UpsertTag);

        app.MapPost("/api/tag-editor/rename-tag", RenameTag);

        app.MapPost("/api/tag-editor/delete-tag", DeleteTag);

        app.MapPost("/api/tag-editor/delete-category", DeleteCategory);

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

        app.MapPost("/api/refresh/settings", UpdateRefreshSettings);

        app.MapGet("/api/backup/settings", (CoreSettingsService settings) =>
        {
            return Results.Ok(settings.GetBackupSettings());
        });

        app.MapPost("/api/backup/settings", (BackupSettingsSnapshot snapshot, CoreSettingsService settings) =>
        {
            return Results.Ok(settings.UpdateBackupSettings(snapshot));
        });

        app.MapPost("/api/duplicates/scan", (DuplicateScanRequest request, LibraryOperationsService operations) =>
        {
            return Results.Ok(operations.ScanDuplicates(request));
        });

        app.MapPost("/api/duplicates/apply", ApplyDuplicates);

        app.MapPost("/api/autotag/scan", (AutoTagScanRequest request, LibraryOperationsService operations) =>
        {
            return Results.Ok(operations.ScanAutoTags(request));
        });

        app.MapPost("/api/autotag/apply", ApplyAutoTags);

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

        app.MapGet("/api/thumbnail/{itemId}", (HttpContext context, string itemId, RefreshPipelineService refresh) =>
            ServeThumbnail(context, itemId, refresh));

        app.MapGet("/api/events", (HttpContext context, ServerStateService state, ConnectedClientTracker clients, OperatorTestingService testingService, IHostApplicationLifetime lifetime) =>
            StreamEventsAsync(context, state, clients, testingService, lifetime.ApplicationStopping));
    }

    internal static IResult PlayItem(
        string itemId,
        PlayItemRequest? body,
        LibraryPlaybackService playback,
        LibraryOperationsService operations,
        ServerStateService state,
        OperatorTestingService testingService)
    {
        var testing = testingService.GetSnapshot();
        var forceMediaMissing = testing.TestingModeEnabled && testing.ForceMediaMissing;
        body ??= new PlayItemRequest();
        body.ClientId = NormalizeOptionalIdentity(body.ClientId);
        body.SessionId = NormalizeOptionalIdentity(body.SessionId);

        if (!playback.TryPlayItem(itemId, forceMediaMissing, out var playResponse, out var statusCode, out var error, out var errorCode))
        {
            return Results.Json(new { error, code = errorCode }, statusCode: statusCode);
        }

        // A fresh media URL for an item already playing counts no second play.
        if (!body.RecordPlayback)
        {
            return Results.Ok(playResponse);
        }

        var recorded = operations.RecordPlayback(playResponse!.ItemId);
        if (!recorded.Found)
        {
            return Results.Json(new { error = "Playback could not be recorded", code = "play_record_failed" }, statusCode: StatusCodes.Status500InternalServerError);
        }

        state.PublishExternal("playbackRecorded", new PlaybackRecordedPayload
        {
            ItemId = recorded.ItemId,
            ClientId = body.ClientId,
            SessionId = body.SessionId,
            PlayCount = recorded.PlayCount,
            LastPlayedUtc = recorded.LastPlayedUtc,
            PreviousLastPlayedUtc = recorded.PreviousLastPlayedUtc
        });
        return Results.Ok(playResponse);
    }

    internal static IResult CreatePreset(CreatePresetRequest request, ServerStateService state)
    {
        var result = state.CreatePreset(request.Name, request.FilterState, NormalizeOptionalIdentity(request.ClientId));
        return PresetWritten(result, answersWithPreset: true);
    }

    internal static IResult UpdatePreset(string presetId, UpdatePresetFilterRequest request, ServerStateService state)
    {
        var result = state.UpdatePresetFilter(presetId, request.FilterState, NormalizeOptionalIdentity(request.ClientId));
        return PresetWritten(result, answersWithPreset: true);
    }

    internal static IResult RenamePreset(string presetId, RenamePresetRequest request, ServerStateService state)
    {
        var result = state.RenamePreset(presetId, request.Name, NormalizeOptionalIdentity(request.ClientId));
        return PresetWritten(result, answersWithPreset: true);
    }

    internal static IResult ReorderPresets(ReorderPresetsRequest request, ServerStateService state)
    {
        var result = state.ReorderPresets(request.PresetIds, NormalizeOptionalIdentity(request.ClientId));
        return PresetWritten(result, answersWithPreset: false);
    }

    internal static IResult DeletePreset(string presetId, DeletePresetRequest? body, ServerStateService state)
    {
        var result = state.DeletePreset(presetId, NormalizeOptionalIdentity(body?.ClientId));
        return PresetWritten(result, answersWithPreset: false);
    }

    /// <summary>
    /// Answers a preset write with the preset as written, or an empty 200 for a reorder or a delete. A refusal or a
    /// write the catalog didn't take answers with the server's reason.
    /// </summary>
    private static IResult PresetWritten(PresetWriteResult result, bool answersWithPreset)
    {
        if (result.Status == PresetWriteStatus.Done)
        {
            return answersWithPreset && result.Preset != null
                ? Results.Ok(ApiContractMapper.MapPreset(result.Preset.Id, result.Preset.Name, result.Preset.FilterState))
                : Results.Ok();
        }

        var statusCode = result.Status switch
        {
            PresetWriteStatus.NotFound => StatusCodes.Status404NotFound,
            PresetWriteStatus.NameTaken or PresetWriteStatus.FilterTaken or PresetWriteStatus.OrderMismatch => StatusCodes.Status409Conflict,
            PresetWriteStatus.NotSaved => StatusCodes.Status500InternalServerError,
            // No name, a filter state that isn't an object, or the default filter.
            _ => StatusCodes.Status400BadRequest
        };
        return Results.Json(new { error = result.Error }, statusCode: statusCode);
    }

    /// <summary>
    /// The version and capabilities, and whether the server has a library. The library state comes from the catalog host,
    /// since without a library the state service has no catalog.
    /// </summary>
    internal static IResult GetVersion(HttpContext context, ServerStateService state, OperatorTestingService testingService, LibraryCatalogHost catalog)
    {
        var version = state.GetVersion();
        AddCallerCapabilities(context, version.Capabilities);
        version.LibraryState = catalog.StateName;
        version.LibraryMessage = catalog.UnavailableMessage;
        var testing = testingService.GetSnapshot();
        if (testing.TestingModeEnabled && testing.ForceApiVersionMismatch)
        {
            version.ApiVersion = "99";
            version.SupportedApiVersions = ["99"];
        }

        if (testing.TestingModeEnabled && testing.ForceCapabilityMismatch)
        {
            version.Capabilities = version.Capabilities
                .Where(capability => !string.Equals(capability, "identity.sessionId", StringComparison.Ordinal))
                .ToList();
        }

        return Results.Ok(version);
    }

    /// <summary>The same capabilities as <see cref="GetVersion"/>, including the ones that depend on the caller.</summary>
    internal static IResult GetCapabilities(HttpContext context, ServerStateService state, OperatorTestingService testingService)
    {
        var capabilities = state.GetVersion().Capabilities;
        AddCallerCapabilities(context, capabilities);
        var testing = testingService.GetSnapshot();
        if (testing.TestingModeEnabled && testing.ForceCapabilityMismatch)
        {
            capabilities = capabilities
                .Where(capability => !string.Equals(capability, "identity.sessionId", StringComparison.Ordinal))
                .ToList();
        }

        return Results.Ok(new
        {
            capabilities
        });
    }

    /// <summary>
    /// Lists the file manager capability only for a caller the show-in-file-manager route would accept: a direct
    /// request from the server machine, while the server has a desktop to open a file manager in.
    /// </summary>
    private static void AddCallerCapabilities(HttpContext context, List<string> capabilities)
    {
        if (LocalRequest.IsLocal(context) && context.RequestServices.GetService<IFileManagerLauncher>()?.IsAvailable == true)
        {
            capabilities.Add(ShowInFileManagerCapability);
        }
    }

    /// <summary>Reads one item by its catalog id, and refuses with 404 an id the catalog doesn't hold.</summary>
    internal static IResult ReadLibraryItem(LibraryItemReadRequest? request, LibraryOperationsService operations)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Id))
        {
            return Results.BadRequest(new { error = "id is required" });
        }

        var item = operations.ReadLibraryItem(request.Id);
        return item == null ? Results.NotFound(new { error = ItemNotInLibrary }) : Results.Json(item);
    }

    /// <summary>
    /// Opens the server machine's file manager at an item's file, for a browser on the server machine. The item is
    /// looked up by its catalog id; the route never takes a path.
    /// </summary>
    internal static async Task<IResult> ShowInFileManager(HttpContext context, string itemId, LibraryCatalogHost catalog)
    {
        var logs = context.RequestServices.GetService<ServerLogService>();
        var id = itemId?.Trim() ?? "";
        void Log(string outcome, string level = "info") =>
            logs?.Append(level, $"Show in file manager item={id} outcome={outcome}.");

        if (!LocalRequest.IsLocal(context))
        {
            Log("not-local");
            return Results.Json(
                new { error = "Only a browser on the server machine can open its file manager.", code = FileManagerErrorNotLocal },
                statusCode: StatusCodes.Status403Forbidden);
        }

        var launcher = context.RequestServices.GetService<IFileManagerLauncher>();
        if (launcher is not { IsAvailable: true })
        {
            Log("unavailable");
            return Results.Json(
                new { error = "The server has no desktop to open a file manager in.", code = FileManagerErrorUnavailable },
                statusCode: StatusCodes.Status409Conflict);
        }

        var item = id.Length == 0 ? null : catalog.Session.ReadPlaybackItem(id);
        if (item == null || string.IsNullOrWhiteSpace(item.FullPath))
        {
            Log("not-found");
            return Results.Json(new { error = ItemNotInLibrary, code = FileManagerErrorItemNotFound }, statusCode: StatusCodes.Status404NotFound);
        }

        if (!File.Exists(item.FullPath))
        {
            Log("file-missing");
            return Results.Json(new { error = "The file isn't on disk.", code = FileManagerErrorFileMissing }, statusCode: StatusCodes.Status404NotFound);
        }

        var result = await launcher.ShowAsync(item.FullPath, context.RequestAborted);
        if (!result.Shown)
        {
            Log($"failed error={result.ErrorType}", "warn");
            return Results.Json(
                new { error = "No file manager on the server machine answered.", code = FileManagerErrorFailed },
                statusCode: StatusCodes.Status500InternalServerError);
        }

        Log(result.ShownWith!);
        return Results.NoContent();
    }

    internal static IResult SetFavorite(FavoriteRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (string.IsNullOrWhiteSpace(request.ItemId))
        {
            return Results.BadRequest(new { error = "itemId is required" });
        }

        var persisted = operations.SetFavorite(request.ItemId, request.IsFavorite, out var previous);
        return PublishItemState(state, persisted, previous, request.ClientId);
    }

    internal static IResult SetBlacklist(BlacklistRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (string.IsNullOrWhiteSpace(request.ItemId))
        {
            return Results.BadRequest(new { error = "itemId is required" });
        }

        var persisted = operations.SetBlacklist(request.ItemId, request.IsBlacklisted, out var previous);
        return PublishItemState(state, persisted, previous, request.ClientId);
    }

    /// <summary>
    /// Sets an item's rating, in stars, or clears it with null, and publishes <c>itemRatingChanged</c> to every client,
    /// naming the one that made it, only when the rating changed.
    /// </summary>
    internal static IResult SetRating(RatingRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (string.IsNullOrWhiteSpace(request.ItemId))
        {
            return Results.BadRequest(new { error = "itemId is required" });
        }

        if (!ItemRating.TryFromStars(request.Rating, out var halfStars))
        {
            return Results.BadRequest(new { error = "rating must be a multiple of 0.5 from 0.5 to 5, or null" });
        }

        var change = operations.SetRating(request.ItemId, halfStars);
        if (change == null)
        {
            return Results.NotFound(new { error = ItemNotInLibrary });
        }

        var rating = ItemRating.ToStars(change.RatingHalfStars);
        var revision = state.GetCurrentRevision();
        if (change.Changed)
        {
            revision = state.PublishExternal("itemRatingChanged", new ItemRatingChangedPayload
            {
                ItemId = change.Id,
                Path = change.FullPath,
                Rating = rating,
                PreviousRating = ItemRating.ToStars(change.PreviousRatingHalfStars),
                ClientId = NormalizeOptionalIdentity(request.ClientId)
            }).Revision;
        }

        return Results.Ok(new ItemRatingResponse { ItemId = change.Id, Rating = rating, Revision = revision });
    }

    /// <summary>
    /// Sets or clears favorite or blacklist on every named item in one write, and publishes one
    /// <c>bulkItemStateChanged</c> for all of them, naming the client that made it, when any is in the library, or
    /// <c>resyncRequired</c> in its place past <see cref="ServerStateService.MaxEventItems"/> changed items.
    /// </summary>
    internal static IResult SetBulkItemState(BulkItemStateRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (!NamesAnyItem(request.ItemIds))
        {
            return Results.BadRequest(new { error = "itemIds is required" });
        }

        CatalogItemFlag flag;
        switch (request.Flag)
        {
            case BulkFlagFavorite:
                flag = CatalogItemFlag.Favorite;
                break;
            case BulkFlagBlacklist:
                flag = CatalogItemFlag.Blacklist;
                break;
            default:
                return Results.BadRequest(new { error = "flag must be favorite or blacklist" });
        }

        var changes = operations.SetItemsFlag(request.ItemIds!, flag, request.Value);
        if (changes.Count > 0)
        {
            var changed = changes.Where(change => change.Changed).ToList();
            state.PublishListingItems("bulkItemStateChanged", changed.Count, () => new BulkItemStateChangedPayload
            {
                Flag = request.Flag,
                Value = request.Value,
                Count = changes.Count,
                Items = changed
                    .Select(change => new BulkItemState
                    {
                        ItemId = change.Id,
                        IsFavorite = change.IsFavorite,
                        IsBlacklisted = change.IsBlacklisted,
                        PreviousIsFavorite = change.PreviousIsFavorite,
                        PreviousIsBlacklisted = change.PreviousIsBlacklisted
                    })
                    .ToList(),
                ClientId = NormalizeOptionalIdentity(request.ClientId)
            });
        }

        return Results.Ok(new BulkChangeResponse { Count = changes.Count });
    }

    /// <summary>
    /// Sets or clears one rating, in stars, on every named item in one write, and publishes one
    /// <c>bulkItemRatingChanged</c> for all of them, naming the client that made it, when any is in the library, or
    /// <c>resyncRequired</c> in its place past <see cref="ServerStateService.MaxEventItems"/> changed items.
    /// </summary>
    internal static IResult SetBulkRating(BulkRatingRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (!NamesAnyItem(request.ItemIds))
        {
            return Results.BadRequest(new { error = "itemIds is required" });
        }

        if (!ItemRating.TryFromStars(request.Rating, out var halfStars))
        {
            return Results.BadRequest(new { error = "rating must be a multiple of 0.5 from 0.5 to 5, or null" });
        }

        var changes = operations.SetItemsRating(request.ItemIds!, halfStars);
        if (changes.Count > 0)
        {
            var changed = changes.Where(change => change.Changed).ToList();
            state.PublishListingItems("bulkItemRatingChanged", changed.Count, () => new BulkItemRatingChangedPayload
            {
                Rating = ItemRating.ToStars(halfStars),
                Count = changes.Count,
                Items = changed
                    .Select(change => new BulkItemRating
                    {
                        ItemId = change.Id,
                        Rating = ItemRating.ToStars(change.RatingHalfStars),
                        PreviousRating = ItemRating.ToStars(change.PreviousRatingHalfStars)
                    })
                    .ToList(),
                ClientId = NormalizeOptionalIdentity(request.ClientId)
            });
        }

        return Results.Ok(new BulkChangeResponse { Count = changes.Count });
    }

    /// <summary>
    /// Deletes the named items' files from disk and removes those items, for a caller the <c>/control</c> routes
    /// accept, and publishes <c>itemsRemoved</c> with the items it removed.
    /// </summary>
    internal static IResult DeleteFiles(
        HttpContext context,
        DeleteFilesRequest request,
        ServerRuntimeOptions options,
        ServerSessionStore sessions,
        CoreSettingsService settings,
        ServerLogService logs,
        ServerStateService state,
        LibraryOperationsService operations)
    {
        if (RefuseFileDeletion(context, "Delete files", options, sessions, settings, logs) is { } refused)
        {
            return refused;
        }

        if (!NamesAnyItem(request.ItemIds))
        {
            return Results.BadRequest(new { error = "itemIds is required" });
        }

        var response = operations.DeleteFiles(request.ItemIds!, out var removedItemIds);
        PublishItemsRemoved(state, removedItemIds);
        return Results.Ok(response);
    }

    /// <summary>
    /// Deletes each duplicate group's files but the one it keeps, for a caller the <c>/control</c> routes accept, as
    /// delete files does, and publishes <c>itemsRemoved</c> with the items it removed.
    /// </summary>
    internal static IResult ApplyDuplicates(
        HttpContext context,
        DuplicateApplyRequest request,
        ServerRuntimeOptions options,
        ServerSessionStore sessions,
        CoreSettingsService settings,
        ServerLogService logs,
        ServerStateService state,
        LibraryOperationsService operations)
    {
        if (RefuseFileDeletion(context, "Duplicate apply", options, sessions, settings, logs) is { } refused)
        {
            return refused;
        }

        var response = operations.ApplyDuplicateSelection(request, out var removedItemIds);
        PublishItemsRemoved(state, removedItemIds);
        return Results.Ok(response);
    }

    /// <summary>
    /// The 403 for a route that deletes files, when the caller isn't one the <c>/control</c> routes accept, with a
    /// warning in <c>last.log</c>, or null for a caller they accept. It is 403, not 401, since the client reads every
    /// 401 as a device that needs pairing.
    /// </summary>
    private static IResult? RefuseFileDeletion(
        HttpContext context,
        string action,
        ServerRuntimeOptions options,
        ServerSessionStore sessions,
        CoreSettingsService settings,
        ServerLogService logs)
    {
        if (ServerPairingAuthMiddleware.IsControlRequestAuthorized(context, options, sessions, settings))
        {
            return null;
        }

        var remote = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        logs.Append("warn", $"{action} refused from {remote}: no control session or control token.");
        return Results.Json(
            new { error = FileDeletionNeedsControlToken, code = ErrorControlTokenRequired },
            statusCode: StatusCodes.Status403Forbidden);
    }

    /// <summary>
    /// Publishes <c>itemsRemoved</c> when items were removed, or <c>resyncRequired</c> in its place past
    /// <see cref="ServerStateService.MaxEventItems"/> of them.
    /// </summary>
    private static void PublishItemsRemoved(ServerStateService state, IReadOnlyList<string> removedItemIds)
    {
        if (removedItemIds.Count > 0)
        {
            state.PublishListingItems("itemsRemoved", removedItemIds.Count, () => new ItemsRemovedPayload { ItemIds = removedItemIds.ToList() });
        }
    }

    /// <summary>The ids of every item the library query with the same filter and search matches.</summary>
    internal static IResult QueryLibraryIds(LibraryIdsQueryRequest? request, LibraryOperationsService operations)
    {
        var response = operations.QueryLibraryIds(request, out var error);
        return response == null
            ? Results.BadRequest(new { error = error ?? "Invalid library query" })
            : Results.Ok(response);
    }

    private static bool NamesAnyItem(IReadOnlyList<string>? itemIds) =>
        itemIds?.Any(id => !string.IsNullOrWhiteSpace(id)) == true;

    /// <summary>
    /// Publishes the change to every client, the one that made it too, naming that client so it can tell its own change
    /// from another device's.
    /// </summary>
    private static IResult PublishItemState(ServerStateService state, LibraryStateResponse? persisted, LibraryStateResponse? previous, string? clientId)
    {
        if (persisted == null || previous == null)
        {
            return Results.NotFound(new { error = ItemNotInLibrary });
        }

        var envelope = state.PublishExternal("itemStateChanged", new ItemStateChangedPayload
        {
            ItemId = persisted.ItemId,
            Path = persisted.Path,
            IsFavorite = persisted.IsFavorite,
            IsBlacklisted = persisted.IsBlacklisted,
            PreviousIsFavorite = previous.IsFavorite,
            PreviousIsBlacklisted = previous.IsBlacklisted,
            ClientId = NormalizeOptionalIdentity(clientId)
        });
        persisted.Revision = envelope.Revision;
        return Results.Ok(persisted);
    }

    /// <summary>
    /// Clears every item's playback stats only when the request says <c>allItems</c>, so a request that names no
    /// items, such as one with a field this server doesn't read, clears nothing. It answers how many of the named items
    /// are in the library, and publishes <c>resyncRequired</c> when it cleared any item's stats.
    /// </summary>
    internal static IResult ClearPlaybackStats(ClearPlaybackStatsRequest request, LibraryOperationsService operations, ServerStateService state)
    {
        var namesItems = NamesAnyItem(request.ItemIds);
        if (request.AllItems && namesItems)
        {
            return Results.BadRequest(new { error = "Send allItems or itemIds, not both" });
        }

        if (!request.AllItems && !namesItems)
        {
            return Results.BadRequest(new { error = "itemIds is required, or allItems to clear every item" });
        }

        var cleared = operations.ClearPlaybackStats(request);
        if (cleared.Changed > 0)
        {
            state.PublishResyncRequired(ResyncRequiredPayload.PlaybackStatsCleared);
        }

        return Results.Ok(new ClearPlaybackStatsResponse { Count = cleared.Count });
    }

    internal static IResult RecordPlayback(RecordPlaybackRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (string.IsNullOrWhiteSpace(request.ItemId))
        {
            return Results.BadRequest(new { error = "itemId is required" });
        }

        request.ClientId = NormalizeOptionalIdentity(request.ClientId);
        request.SessionId = NormalizeOptionalIdentity(request.SessionId);
        var recorded = operations.RecordPlayback(request.ItemId);
        if (!recorded.Found)
        {
            return Results.NotFound(new { error = ItemNotInLibrary });
        }

        var envelope = state.PublishExternal("playbackRecorded", new PlaybackRecordedPayload
        {
            ItemId = recorded.ItemId,
            ClientId = request.ClientId,
            SessionId = request.SessionId,
            PlayCount = recorded.PlayCount,
            LastPlayedUtc = recorded.LastPlayedUtc,
            PreviousLastPlayedUtc = recorded.PreviousLastPlayedUtc
        });
        return Results.Ok(new RecordPlaybackResponse
        {
            ItemId = recorded.ItemId,
            Revision = envelope.Revision,
            PlayCount = recorded.PlayCount,
            LastPlayedUtc = recorded.LastPlayedUtc
        });
    }

    /// <summary>Saves a category. Its only refusal, a blank name, is answered 400 before the catalog sees it.</summary>
    internal static IResult UpsertCategory(UpsertCategoryRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "id and name are required" });
        }

        _ = operations.UpsertCategory(request);
        return ReplyWithTagCatalog(state, operations, "upsertCategory");
    }

    /// <summary>Creates a tag, or moves one to another category, and refuses one already in the category it names.</summary>
    internal static IResult UpsertTag(UpsertTagRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "name is required" });
        }

        return operations.UpsertTag(request)
            ? ReplyWithTagCatalog(state, operations, "upsertTag")
            : TagChangeRefused($"A tag named \"{request.Name.Trim()}\" already exists.");
    }

    /// <summary>Renames a tag, merging it into one that has the new name, and refuses a tag the catalog doesn't have.</summary>
    internal static IResult RenameTag(RenameTagRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (string.IsNullOrWhiteSpace(request.OldName) || string.IsNullOrWhiteSpace(request.NewName))
        {
            return Results.BadRequest(new { error = "oldName and newName are required" });
        }

        var oldName = request.OldName.Trim();
        if (!operations.RenameTag(request, out var changedItemIds))
        {
            return TagChangeRefused($"There's no tag named \"{oldName}\".");
        }

        _ = state.RenameTagInPresetCatalogOnly(request.OldName, request.NewName);
        var newName = request.NewName.Trim();
        if (changedItemIds.Count > 0 && !string.Equals(oldName, newName, StringComparison.Ordinal))
        {
            state.PublishExternal("itemTagsChanged", new ItemTagsChangedPayload
            {
                ResolvedItemIds = changedItemIds,
                AddedTags = [newName],
                RemovedTags = [oldName],
                CatalogReplacedTag = oldName,
                CatalogReplacementTag = newName
            });
        }

        return ReplyWithTagCatalog(state, operations, "renameTag");
    }

    /// <summary>Deletes a tag from the catalog and every item, and refuses one that neither has.</summary>
    internal static IResult DeleteTag(DeleteTagRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return Results.BadRequest(new { error = "name is required" });
        }

        var name = request.Name.Trim();
        if (!operations.DeleteTag(request, out var changedItemIds))
        {
            return TagChangeRefused($"There's no tag named \"{name}\".");
        }

        _ = state.RemoveTagFromPresetCatalogOnly(request.Name);
        if (changedItemIds.Count > 0)
        {
            state.PublishExternal("itemTagsChanged", new ItemTagsChangedPayload
            {
                ResolvedItemIds = changedItemIds,
                AddedTags = [],
                RemovedTags = [name],
                CatalogReplacedTag = name
            });
        }

        return ReplyWithTagCatalog(state, operations, "deleteTag");
    }

    /// <summary>Deletes a category, moving its tags to Uncategorized, and refuses one the catalog doesn't have.</summary>
    internal static IResult DeleteCategory(DeleteCategoryRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (string.IsNullOrWhiteSpace(request.CategoryId))
        {
            return Results.BadRequest(new { error = "categoryId is required" });
        }

        return operations.DeleteCategory(request)
            ? ReplyWithTagCatalog(state, operations, "deleteCategory")
            : TagChangeRefused("That category doesn't exist.");
    }

    /// <summary>The 409 for a tag editor change the catalog didn't take, with its reason for the user.</summary>
    private static IResult TagChangeRefused(string reason) =>
        Results.Json(new { error = reason }, statusCode: StatusCodes.Status409Conflict);

    /// <summary>Publishes the tag catalog after a change, named by <paramref name="reason"/>, and answers with it.</summary>
    private static IResult ReplyWithTagCatalog(ServerStateService state, LibraryOperationsService operations, string reason)
    {
        var model = operations.GetTagEditorModel(new TagEditorModelRequest());
        var envelope = PublishTagCatalog(state, model, reason);
        return Results.Ok(new
        {
            accepted = true,
            revision = envelope.Revision,
            categories = model.Categories,
            tags = model.Tags
        });
    }

    /// <summary>Publishes <paramref name="model"/> as the tag catalog after a change named by <paramref name="reason"/>.</summary>
    private static ServerEventEnvelope PublishTagCatalog(ServerStateService state, TagEditorModelResponse model, string reason) =>
        state.PublishExternal("tagCatalogChanged", new TagCatalogChangedPayload
        {
            Reason = reason,
            Categories = model.Categories,
            Tags = model.Tags
        });

    internal static IResult ApplyItemTags(ApplyItemTagsRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (request.ItemIds.Count == 0)
        {
            return Results.BadRequest(new { error = "itemIds must contain at least one id" });
        }

        var accepted = operations.ApplyItemTags(request, out var catalogChanged, out var resolvedItemIds);
        if (!accepted)
        {
            // No named file is in the catalog, as after a refresh removed the playing file, or each already had the tags.
            return resolvedItemIds.Count == 0
                ? Results.NotFound(new { error = ItemNotInLibrary })
                : TagChangeRefused("The tags were already that way.");
        }

        var itemTagsEnvelope = state.PublishExternal("itemTagsChanged", new ItemTagsChangedPayload
        {
            ResolvedItemIds = resolvedItemIds,
            AddedTags = request.AddTags,
            RemovedTags = request.RemoveTags
        });
        var model = operations.GetTagEditorModel(new TagEditorModelRequest());
        var catalogEnvelope = catalogChanged ? PublishTagCatalog(state, model, "applyItemTags") : null;

        return Results.Ok(new
        {
            accepted = true,
            itemTagsRevision = itemTagsEnvelope.Revision,
            tagCatalogRevision = catalogEnvelope?.Revision,
            categories = model.Categories,
            tags = model.Tags
        });
    }

    internal static IResult ApplyAutoTags(AutoTagApplyRequest request, LibraryOperationsService operations, ServerStateService state)
    {
        var response = operations.ApplyAutoTags(request, out var applied);
        // Each applied entry is a tag that gained at least one file.
        if (applied.Count > 0)
        {
            foreach (var assignment in applied)
            {
                state.PublishExternal("itemTagsChanged", new ItemTagsChangedPayload
                {
                    ResolvedItemIds = assignment.ChangedItemIds,
                    AddedTags = [assignment.TagName],
                    RemovedTags = []
                });
            }

            PublishTagCatalog(state, operations.GetTagEditorModel(new TagEditorModelRequest()), "autotagApply");
        }

        return Results.Ok(response);
    }

    internal static IResult ServeThumbnail(HttpContext context, string itemId, RefreshPipelineService refresh)
    {
        if (string.IsNullOrWhiteSpace(itemId))
        {
            return Results.BadRequest(new { error = "itemId is required" });
        }

        var file = new FileInfo(refresh.GetThumbnailPath(itemId));
        if (!file.Exists)
        {
            return Results.NotFound();
        }

        // A URL carrying the current version never changes content, so the browser keeps it.
        // Any other request revalidates against the ETag.
        var version = RefreshPipelineService.ThumbnailVersion(file);
        context.Response.Headers.CacheControl = string.Equals(context.Request.Query["v"].ToString(), version, StringComparison.Ordinal)
            ? "private, max-age=31536000, immutable"
            : "no-cache";
        return Results.File(
            file.FullName,
            "image/jpeg",
            lastModified: file.LastWriteTimeUtc,
            entityTag: new EntityTagHeaderValue($"\"{version}\""));
    }

    internal static IResult ServeMedia(
        HttpContext context,
        string token,
        LibraryPlaybackService playback,
        OperatorTestingService testingService,
        CancellationToken serverStopping)
    {
        var testing = testingService.GetSnapshot();
        if (testing.TestingModeEnabled && testing.ForceMediaMissing)
        {
            return Results.NotFound(new { error = "Media not found" });
        }

        if (!playback.TryResolveMediaPath(token, out var fullPath))
        {
            return Results.NotFound(new { error = "Media not found" });
        }

        var fileState = MediaFileProbe.Probe(fullPath, out var readError);
        if (fileState == MediaFileState.Missing)
        {
            return Results.NotFound(new { error = "Media not found" });
        }

        if (fileState == MediaFileState.Unreadable)
        {
            context.RequestServices.GetService<ServerLogService>()?.Append(
                "warn",
                $"Media read failed error={readError?.GetType().Name}.");
            return Results.Json(new { error = "Media can't be read" }, statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        // A player with a full buffer stops reading, and stopping the server waits for every open response.
        // Cut this one when the server starts stopping so stop and restart do not wait on the player.
        context.Response.RegisterForDispose(serverStopping.Register(context.Abort));

        var contentType = ContentTypeProvider.TryGetContentType(fullPath, out var resolvedType)
            ? resolvedType
            : "application/octet-stream";
        return Results.File(fullPath, contentType, enableRangeProcessing: true);
    }

    internal static async Task StreamEventsAsync(
        HttpContext context,
        ServerStateService state,
        ConnectedClientTracker clients,
        OperatorTestingService testingService,
        CancellationToken serverStopping)
    {
        var testing = testingService.GetSnapshot();
        if (testing.TestingModeEnabled && testing.ForceSseDisconnect)
        {
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsJsonAsync(new { error = "Testing mode: SSE disconnect simulation active." }, context.RequestAborted);
            return;
        }

        context.Response.Headers.Append("Content-Type", "text/event-stream");
        context.Response.Headers.Append("Cache-Control", "no-cache");
        context.Response.Headers.Append("Connection", "keep-alive");
        // nginx buffers proxied responses by default, which would hold events back.
        context.Response.Headers.Append("X-Accel-Buffering", "no");

        // Stopping the server waits for every open response, so the stream also ends when the server starts stopping.
        using var streamEnd = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, serverStopping);
        var cancellationToken = streamEnd.Token;
        var serializerOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var lastEventHeader = context.Request.Headers["Last-Event-ID"].ToString();
        var lastEventQuery = context.Request.Query["lastEventId"].ToString();
        var clientId = NormalizeOptionalIdentity(context.Request.Query["clientId"].ToString());
        var sessionId = NormalizeOptionalIdentity(context.Request.Query["sessionId"].ToString());
        var clientType = NormalizeOptionalIdentity(context.Request.Query["clientType"].ToString());
        var deviceName = NormalizeOptionalIdentity(context.Request.Query["deviceName"].ToString());
        var userAgent = context.Request.Headers["User-Agent"].ToString();
        var connectionId = clients.RegisterSseClient(
            clientId,
            sessionId,
            clientType,
            deviceName,
            userAgent,
            context.Connection.RemoteIpAddress?.ToString());
        var hasLastEvent = long.TryParse(lastEventHeader, out var lastEventRevision) ||
                           long.TryParse(lastEventQuery, out lastEventRevision);
        long lastDeliveredRevision = 0;

        try
        {
            await context.Response.WriteAsync("retry: 1000\n\n", cancellationToken);
            await context.Response.Body.FlushAsync(cancellationToken);

            var reader = state.Subscribe(cancellationToken);
            if (!hasLastEvent)
            {
                // Sent before anything else so a client that receives no other event can still resume after a reconnect.
                // It does not move lastDeliveredRevision: an event already queued for this stream is still sent.
                await WriteSseEnvelopeAsync(context, state.CreateStreamOpenedEnvelope(), serializerOptions, cancellationToken);
            }
            else
            {
                var replay = state.GetReplayAfter(lastEventRevision);
                if (replay.GapDetected)
                {
                    var resyncEnvelope = state.CreateEnvelope(
                        ResyncRequiredPayload.EventType,
                        new ResyncRequiredPayload
                        {
                            Reason = ResyncRequiredPayload.RevisionGap,
                            LastEventId = lastEventRevision,
                            CurrentRevision = replay.CurrentRevision
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
        }
        catch (OperationCanceledException) when (serverStopping.IsCancellationRequested && !context.RequestAborted.IsCancellationRequested)
        {
            // The server is stopping: end the response normally, and the client reconnects as after any dropped stream.
        }
        finally
        {
            // Disposing the linked source would detach it without cancelling, so the subscription would never end.
            streamEnd.Cancel();
            clients.UnregisterSseClient(connectionId);
        }
    }

    internal static IResult HandlePairRequest(
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
            return Results.Json(new { error = "The pairing token is wrong." }, statusCode: StatusCodes.Status401Unauthorized);
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

    internal static IResult GetControlAccess() => Results.NoContent();

    internal static IResult HandleControlPairRequest(
        HttpContext context,
        string? token,
        ServerRuntimeOptions options,
        CoreSettingsService settings,
        ServerSessionStore sessions,
        ServerLogService logs)
    {
        var control = settings.GetControlRuntimeSettings();
        if (string.IsNullOrWhiteSpace(control.AdminSharedToken) ||
            string.IsNullOrWhiteSpace(token) ||
            !string.Equals(control.AdminSharedToken, token, StringComparison.Ordinal))
        {
            var remote = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            logs.Append("warn", $"Control pairing failed from {remote}: wrong or missing control token.");
            return Results.Json(new { error = "The control token is wrong." }, statusCode: StatusCodes.Status401Unauthorized);
        }

        IssueControlSession(context, options, sessions);
        return Results.Ok(new { paired = true, message = "Control paired successfully" });
    }

    private static void IssueControlSession(HttpContext context, ServerRuntimeOptions options, ServerSessionStore sessions)
    {
        var sessionId = sessions.CreateSession(
            ServerSessionStore.ControlScope,
            DateTimeOffset.UtcNow,
            TimeSpan.FromHours(options.PairingSessionDurationHours));

        context.Response.Cookies.Append(
            options.ControlAdminCookieName,
            sessionId,
            PairingCookiePolicy.BuildCookieOptions(options, context.Request.IsHttps));
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

    private static string? NormalizeOptionalIdentity(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static SessionInfoSnapshot MapSessionSnapshot(SessionSnapshot snapshot)
    {
        return new SessionInfoSnapshot
        {
            SessionId = snapshot.SessionId,
            CreatedUtc = snapshot.CreatedUtc,
            LastSeenUtc = snapshot.LastSeenUtc,
            ExpiresUtc = snapshot.ExpiresUtc
        };
    }

    internal static IResult UpdateControlSettings(
        HttpContext context,
        ControlRuntimeSettingsSnapshot snapshot,
        ServerRuntimeOptions options,
        CoreSettingsService settings,
        ServerSessionStore sessions)
    {
        var before = settings.GetControlRuntimeSettings();
        var (appliedSettings, applyResult) = settings.UpdateControlRuntimeSettings(snapshot);
        if (applyResult.Accepted)
        {
            if (!string.Equals(before.AdminSharedToken, appliedSettings.AdminSharedToken, StringComparison.Ordinal))
            {
                // A new control token ends every control session, so a leaked token stops working everywhere.
                var ended = sessions.EndSessions(ServerSessionStore.ControlScope);
                context.RequestServices.GetService<ServerLogService>()?.Append(
                    "info",
                    $"Control token changed; ended {ended} control session(s).");

                // A non-local caller gets a fresh session so the rest of its save still goes through.
                if (!LocalRequest.IsLocal(context))
                {
                    IssueControlSession(context, options, sessions);
                }
            }

            if (before.DevChannelEnabled != appliedSettings.DevChannelEnabled)
            {
                context.RequestServices.GetService<IServerUpdateChannelCoordinator>()?.NotifyDevChannelChanged();
            }
        }

        return Results.Ok(new
        {
            settings = appliedSettings,
            result = applyResult
        });
    }

    internal static IResult UpdateTesting(OperatorTestingUpdateRequest request, OperatorTestingService testingService)
    {
        var current = testingService.GetSnapshot();
        var mutatesFaultFlags =
            request.ForceApiVersionMismatch.HasValue ||
            request.ForceCapabilityMismatch.HasValue ||
            request.ForceApiUnavailable.HasValue ||
            request.ForceMediaMissing.HasValue ||
            request.ForceSseDisconnect.HasValue;
        var enablingTestingMode = request.TestingModeEnabled == true;
        if (mutatesFaultFlags && !current.TestingModeEnabled && !enablingTestingMode)
        {
            return Results.Json(new { error = "Testing mode is required before enabling scenario/fault flags." }, statusCode: StatusCodes.Status409Conflict);
        }

        var updated = testingService.Apply(request);
        return Results.Ok(new OperatorTestingActionResponse
        {
            Accepted = true,
            Message = "Testing state updated.",
            State = updated
        });
    }

    internal static IResult ResetTesting(OperatorTestingService testingService)
    {
        var updated = testingService.Reset();
        return Results.Ok(new OperatorTestingActionResponse
        {
            Accepted = true,
            Message = "Testing scenario flags reset.",
            State = updated
        });
    }

    internal static IResult UpdateRefreshSettings(RefreshSettingsSnapshot snapshot, RefreshPipelineService refresh)
    {
        return Results.Ok(refresh.UpdateSettings(snapshot));
    }
}
