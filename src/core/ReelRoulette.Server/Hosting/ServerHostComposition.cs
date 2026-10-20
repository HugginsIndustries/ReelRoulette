using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Net.Http.Headers;
using ReelRoulette.Server.Auth;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Server.Hosting;

public static class ServerHostComposition
{
    public const string WebClientCorsPolicyName = "ReelRouletteWebClient";
    internal const string ShowInFileManagerCapability = "api.showInFileManager";
    internal const string FileManagerErrorNotLocal = "file_manager_not_local";
    internal const string FileManagerErrorUnavailable = "file_manager_unavailable";
    internal const string FileManagerErrorItemNotFound = "file_manager_item_not_found";
    internal const string FileManagerErrorFileMissing = "file_manager_file_missing";
    internal const string FileManagerErrorFailed = "file_manager_failed";
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();

    public static void AddReelRouletteServer(this IServiceCollection services)
    {
        services.AddSingleton(sp =>
        {
            var appDataRoot = ServerDataPaths.DataDirectory();
            var host = LibraryCatalogHost.Open(appDataRoot);
            var logger = sp.GetRequiredService<ILogger<LibraryCatalogHost>>();
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
        });
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

        // Next, ahead of telemetry and CORS, so nothing else answers a device that remote connections refuse.
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

        if (options.EnableCors)
        {
            app.UseCors(WebClientCorsPolicyName);
        }

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

        app.MapPost("/api/library/item", (LibraryItemReadRequest? request, LibraryOperationsService operations) =>
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Id))
            {
                return Results.BadRequest(new { error = "id is required" });
            }

            var item = operations.ReadLibraryItem(request.Id);
            if (item == null)
            {
                return Results.NotFound(new { error = "item not found" });
            }

            return Results.Json(item);
        });

        app.MapPost("/api/library/query", (LibraryQueryRequest? request, LibraryOperationsService operations, RefreshPipelineService refresh) =>
        {
            var outcome = operations.QueryLibrary(request, refresh.EnrichListedItems);
            if (!outcome.Accepted || outcome.Body == null)
            {
                return Results.BadRequest(new { error = outcome.Error ?? "Invalid library query" });
            }

            return Results.Json(outcome.Body);
        });

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

        app.MapPost("/api/random", (RandomRequest request, ServerStateService state, LibraryPlaybackService playback, OperatorTestingService testingService) =>
        {
            request.ClientId = NormalizeOptionalIdentity(request.ClientId);
            request.SessionId = NormalizeOptionalIdentity(request.SessionId);
            if (!playback.TrySelectRandom(
                    request,
                    state.GetPresetCatalogSnapshot(),
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

        app.MapPost("/api/play/{itemId}", PlayItem);

        app.MapPost("/api/show-in-file-manager/{itemId}", ShowInFileManager);

        app.MapGet("/api/media/{token}", (HttpContext context, string token, LibraryPlaybackService playback, OperatorTestingService testingService, IHostApplicationLifetime lifetime) =>
            ServeMedia(context, token, playback, testingService, lifetime.ApplicationStopping));

        app.MapPost("/api/favorite", SetFavorite);

        app.MapPost("/api/blacklist", SetBlacklist);

        app.MapPost("/api/record-playback", RecordPlayback);

        app.MapPost("/api/playback/clear-stats", ClearPlaybackStats);

        app.MapPost("/api/tag-editor/model", (TagEditorModelRequest request, LibraryOperationsService operations) =>
        {
            var model = operations.GetTagEditorModel(request);
            return Results.Ok(model);
        });

        app.MapPost("/api/tag-editor/apply-item-tags", ApplyItemTags);

        app.MapPost("/api/tag-editor/upsert-category", (UpsertCategoryRequest request, ServerStateService state, LibraryOperationsService operations) =>
        {
            if (string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "id and name are required" });
            }

            var accepted = operations.UpsertCategory(request);
            if (!accepted)
            {
                return Results.Json(new { error = "upsert category rejected or produced no changes" }, statusCode: StatusCodes.Status409Conflict);
            }

            var model = operations.GetTagEditorModel(new TagEditorModelRequest());
            var envelope = state.PublishExternal("tagCatalogChanged", new TagCatalogChangedPayload
            {
                Reason = "upsertCategory",
                Categories = model.Categories,
                Tags = model.Tags
            });
            return Results.Ok(new
            {
                accepted = true,
                revision = envelope.Revision,
                categories = model.Categories,
                tags = model.Tags
            });
        });

        app.MapPost("/api/tag-editor/upsert-tag", (UpsertTagRequest request, ServerStateService state, LibraryOperationsService operations) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "name is required" });
            }

            var accepted = operations.UpsertTag(request);
            if (!accepted)
            {
                return Results.Json(new { error = "upsert tag rejected or produced no changes" }, statusCode: StatusCodes.Status409Conflict);
            }

            var model = operations.GetTagEditorModel(new TagEditorModelRequest());
            var envelope = state.PublishExternal("tagCatalogChanged", new TagCatalogChangedPayload
            {
                Reason = "upsertTag",
                Categories = model.Categories,
                Tags = model.Tags
            });
            return Results.Ok(new
            {
                accepted = true,
                revision = envelope.Revision,
                categories = model.Categories,
                tags = model.Tags
            });
        });

        app.MapPost("/api/tag-editor/rename-tag", (RenameTagRequest request, ServerStateService state, LibraryOperationsService operations) =>
        {
            if (string.IsNullOrWhiteSpace(request.OldName) || string.IsNullOrWhiteSpace(request.NewName))
            {
                return Results.BadRequest(new { error = "oldName and newName are required" });
            }

            var accepted = operations.RenameTag(request, out var changedItemIds);
            if (!accepted)
            {
                return Results.Json(new { error = "rename tag rejected or produced no changes" }, statusCode: StatusCodes.Status409Conflict);
            }

            _ = state.RenameTagInPresetCatalogOnly(request.OldName, request.NewName);
            var oldName = request.OldName.Trim();
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

            var model = operations.GetTagEditorModel(new TagEditorModelRequest());
            var envelope = state.PublishExternal("tagCatalogChanged", new TagCatalogChangedPayload
            {
                Reason = "renameTag",
                Categories = model.Categories,
                Tags = model.Tags
            });
            return Results.Ok(new
            {
                accepted = true,
                revision = envelope.Revision,
                categories = model.Categories,
                tags = model.Tags
            });
        });

        app.MapPost("/api/tag-editor/delete-tag", (DeleteTagRequest request, ServerStateService state, LibraryOperationsService operations) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "name is required" });
            }

            var accepted = operations.DeleteTag(request, out var changedItemIds);
            if (!accepted)
            {
                return Results.Json(new { error = "delete tag rejected or produced no changes" }, statusCode: StatusCodes.Status409Conflict);
            }

            _ = state.RemoveTagFromPresetCatalogOnly(request.Name);
            if (changedItemIds.Count > 0)
            {
                state.PublishExternal("itemTagsChanged", new ItemTagsChangedPayload
                {
                    ResolvedItemIds = changedItemIds,
                    AddedTags = [],
                    RemovedTags = [request.Name.Trim()],
                    CatalogReplacedTag = request.Name.Trim()
                });
            }

            var model = operations.GetTagEditorModel(new TagEditorModelRequest());
            var envelope = state.PublishExternal("tagCatalogChanged", new TagCatalogChangedPayload
            {
                Reason = "deleteTag",
                Categories = model.Categories,
                Tags = model.Tags
            });
            return Results.Ok(new
            {
                accepted = true,
                revision = envelope.Revision,
                categories = model.Categories,
                tags = model.Tags
            });
        });

        app.MapPost("/api/tag-editor/delete-category", (DeleteCategoryRequest request, ServerStateService state, LibraryOperationsService operations) =>
        {
            if (string.IsNullOrWhiteSpace(request.CategoryId))
            {
                return Results.BadRequest(new { error = "categoryId is required" });
            }

            var accepted = operations.DeleteCategory(request);
            if (!accepted)
            {
                return Results.Json(new { error = "delete category rejected or produced no changes" }, statusCode: StatusCodes.Status409Conflict);
            }

            var model = operations.GetTagEditorModel(new TagEditorModelRequest());
            var envelope = state.PublishExternal("tagCatalogChanged", new TagCatalogChangedPayload
            {
                Reason = "deleteCategory",
                Categories = model.Categories,
                Tags = model.Tags
            });
            return Results.Ok(new
            {
                accepted = true,
                revision = envelope.Revision,
                categories = model.Categories,
                tags = model.Tags
            });
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

        app.MapPost("/api/duplicates/apply", (DuplicateApplyRequest request, LibraryOperationsService operations) =>
        {
            return Results.Ok(operations.ApplyDuplicateSelection(request));
        });

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
            return Results.Json(new { error = "Item not found", code = FileManagerErrorItemNotFound }, statusCode: StatusCodes.Status404NotFound);
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
                new { error = "The file manager couldn't be opened.", code = FileManagerErrorFailed },
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
    /// Publishes the change to every client, the one that made it too, naming that client so it can tell its own change
    /// from another device's.
    /// </summary>
    private static IResult PublishItemState(ServerStateService state, LibraryStateResponse? persisted, LibraryStateResponse? previous, string? clientId)
    {
        if (persisted == null || previous == null)
        {
            return Results.NotFound(new { error = "item not found in library" });
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
    /// items, such as one with a field this server doesn't read, clears nothing.
    /// </summary>
    internal static IResult ClearPlaybackStats(ClearPlaybackStatsRequest request, LibraryOperationsService operations, ServerStateService state)
    {
        var namesItems = request.ItemIds?.Any(id => !string.IsNullOrWhiteSpace(id)) == true;
        if (request.AllItems && namesItems)
        {
            return Results.BadRequest(new { error = "Send allItems or itemIds, not both" });
        }

        if (!request.AllItems && !namesItems)
        {
            return Results.BadRequest(new { error = "itemIds is required, or allItems to clear every item" });
        }

        var response = operations.ClearPlaybackStats(request);
        if (response.ClearedCount > 0)
        {
            state.PublishExternal("resyncRequired", new
            {
                reason = "playbackStatsCleared"
            });
        }

        return Results.Ok(response);
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
            return Results.NotFound(new { error = "item not found in library" });
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

    internal static IResult ApplyItemTags(ApplyItemTagsRequest request, ServerStateService state, LibraryOperationsService operations)
    {
        if (request.ItemIds.Count == 0)
        {
            return Results.BadRequest(new { error = "itemIds must contain at least one id" });
        }

        var accepted = operations.ApplyItemTags(request, out var catalogChanged, out var resolvedItemIds);
        if (!accepted)
        {
            return Results.Json(new { error = "apply rejected or produced no changes" }, statusCode: StatusCodes.Status409Conflict);
        }

        var itemTagsEnvelope = state.PublishExternal("itemTagsChanged", new ItemTagsChangedPayload
        {
            ResolvedItemIds = resolvedItemIds,
            AddedTags = request.AddTags,
            RemovedTags = request.RemoveTags
        });
        var model = operations.GetTagEditorModel(new TagEditorModelRequest());
        ServerEventEnvelope? catalogEnvelope = null;
        if (catalogChanged)
        {
            catalogEnvelope = state.PublishExternal("tagCatalogChanged", new TagCatalogChangedPayload
            {
                Reason = "applyItemTags",
                Categories = model.Categories,
                Tags = model.Tags
            });
        }

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

            var model = operations.GetTagEditorModel(new TagEditorModelRequest());
            state.PublishExternal("tagCatalogChanged", new TagCatalogChangedPayload
            {
                Reason = "autotagApply",
                Categories = model.Categories,
                Tags = model.Tags
            });
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
            return Results.Json(new { error = "Unauthorized" }, statusCode: StatusCodes.Status401Unauthorized);
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
