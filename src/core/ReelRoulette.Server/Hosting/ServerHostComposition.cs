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
        services.AddSingleton<ConnectedClientTracker>();
        services.AddSingleton<OperatorTestingService>();
        services.AddSingleton<ServerLogService>();
        services.AddSingleton(sp =>
        {
            var logger = sp.GetRequiredService<ILogger<LibraryMigrationService>>();
            var appDataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
            return new LibraryMigrationService(logger, appDataRoot);
        });
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

        app.MapGet("/api/version", (ServerStateService state, OperatorTestingService testingService) =>
        {
            var version = state.GetVersion();
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
        });

        app.MapGet("/api/capabilities", (ServerStateService state, OperatorTestingService testingService) =>
        {
            var capabilities = state.GetVersion().Capabilities.ToList();
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
        });

        app.MapGet("/control/status", (ServerRuntimeOptions runtime, CoreSettingsService settings, ServerSessionStore sessions, ServerStateService state, ApiTelemetryService telemetry, ConnectedClientTracker clients, OperatorTestingService testingService) =>
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
                Testing = testingService.GetSnapshot()
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

        app.MapGet("/control/logs/server", (int? tail, string? contains, string? level, ServerLogService logs) =>
        {
            var response = logs.Read(tail ?? 200, contains, level);
            return Results.Ok(response);
        });

        app.MapGet("/control/testing", (OperatorTestingService testingService) =>
        {
            return Results.Ok(testingService.GetSnapshot());
        });

        app.MapPost("/control/testing/update", (HttpContext context, OperatorTestingUpdateRequest request, OperatorTestingService testingService, CoreSettingsService settings, ServerSessionStore sessions) =>
        {
            if (!IsTestingControlAuthorized(context, settings, options, sessions))
            {
                return Results.Json(new { error = "Unauthorized. Control testing actions require admin auth when AdminAuthMode=TokenRequired." }, statusCode: StatusCodes.Status401Unauthorized);
            }

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
        });

        app.MapPost("/control/testing/reset", (HttpContext context, OperatorTestingService testingService, CoreSettingsService settings, ServerSessionStore sessions) =>
        {
            if (!IsTestingControlAuthorized(context, settings, options, sessions))
            {
                return Results.Json(new { error = "Unauthorized. Control testing actions require admin auth when AdminAuthMode=TokenRequired." }, statusCode: StatusCodes.Status401Unauthorized);
            }

            var updated = testingService.Reset();
            return Results.Ok(new OperatorTestingActionResponse
            {
                Accepted = true,
                Message = "Testing scenario flags reset.",
                State = updated
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

        app.MapGet("/api/library/stats", (LibraryOperationsService operations) =>
        {
            return Results.Ok(operations.GetLibraryStats());
        });

        app.MapPost("/api/library/export", async Task (HttpContext http, LibraryExportRequest? body, LibraryMigrationService migration) =>
        {
            var request = body ?? new LibraryExportRequest();
            var fileName = $"ReelRoulette-Library-{DateTime.UtcNow:yyyyMMdd-HHmmss}Z.zip";
            http.Response.ContentType = "application/zip";
            http.Response.Headers.ContentDisposition = $"attachment; filename=\"{fileName}\"";
            await migration.WriteExportZipAsync(http.Response.Body, request, http.RequestAborted).ConfigureAwait(false);
        });

        app.MapPost("/api/library/import", async Task<IResult> (
                HttpContext http,
                LibraryMigrationService migration,
                RefreshPipelineService refresh,
                ServerStateService state,
                CoreSettingsService settings,
                bool force = false) =>
        {
            var form = await http.Request.ReadFormAsync(http.RequestAborted).ConfigureAwait(false);
            var file = form.Files.GetFile("file");
            if (file == null || file.Length == 0)
            {
                return Results.BadRequest(new { error = "Multipart field 'file' (zip archive) is required." });
            }

            var planRaw = form["plan"].FirstOrDefault() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(planRaw))
            {
                return Results.BadRequest(new { error = "Multipart field 'plan' (JSON object) is required." });
            }

            LibraryImportPlanDto? plan;
            try
            {
                plan = JsonSerializer.Deserialize<LibraryImportPlanDto>(planRaw, new JsonSerializerOptions(JsonSerializerDefaults.Web)
                {
                    PropertyNameCaseInsensitive = true
                });
            }
            catch
            {
                return Results.BadRequest(new { error = "Field 'plan' must be valid JSON." });
            }

            if (plan == null)
            {
                return Results.BadRequest(new { error = "Field 'plan' could not be parsed." });
            }

            await using var buffer = new MemoryStream();
            await using (var upload = file.OpenReadStream())
            {
                await upload.CopyToAsync(buffer, http.RequestAborted).ConfigureAwait(false);
            }

            buffer.Position = 0;
            var result = migration.ImportFromZipStream(buffer, plan, force, refresh, state, settings);
            if (!result.Accepted)
            {
                if (result.NeedsForceConfirmation)
                {
                    return Results.Json(
                        new { error = result.Message, needsForce = true },
                        statusCode: StatusCodes.Status409Conflict);
                }

                return Results.BadRequest(new { error = result.Message });
            }

            state.PublishExternal("resyncRequired", new { reason = "libraryImported" });
            return Results.Ok(new
            {
                accepted = true,
                message = result.Message,
                restartRecommended = result.RestartRecommended
            });
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

        app.MapPost("/api/random", (RandomRequest request, ServerStateService state, LibraryPlaybackService playback, LibraryOperationsService operations, OperatorTestingService testingService) =>
        {
            request.ClientId = NormalizeOptionalIdentity(request.ClientId);
            request.SessionId = NormalizeOptionalIdentity(request.SessionId);
            var tagModel = operations.GetTagEditorModel(new TagEditorModelRequest());
            if (!playback.TrySelectRandom(
                    request,
                    state.GetPresetCatalogSnapshot(),
                    tagModel.Categories,
                    tagModel.Tags,
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

        app.MapGet("/api/media/{idOrToken}", (string idOrToken, LibraryPlaybackService playback, OperatorTestingService testingService) =>
        {
            var testing = testingService.GetSnapshot();
            if (testing.TestingModeEnabled && testing.ForceMediaMissing)
            {
                return Results.NotFound(new { error = "Media not found" });
            }

            if (!playback.TryResolveMediaPath(idOrToken, out var fullPath) || !File.Exists(fullPath))
            {
                return Results.NotFound(new { error = "Media not found" });
            }

            var contentType = ContentTypeProvider.TryGetContentType(fullPath, out var resolvedType)
                ? resolvedType
                : "application/octet-stream";
            return Results.File(fullPath, contentType, enableRangeProcessing: true);
        });

        app.MapPost("/api/favorite", (FavoriteRequest request, ServerStateService state, LibraryOperationsService operations) =>
        {
            if (string.IsNullOrWhiteSpace(request.Path))
            {
                return Results.BadRequest(new { error = "path is required" });
            }

            var persisted = operations.SetFavorite(request.Path, request.IsFavorite);
            if (persisted == null)
            {
                return Results.NotFound(new { error = "path not found in library" });
            }

            var envelope = state.PublishExternal("itemStateChanged", new ItemStateChangedPayload
            {
                ItemId = persisted.ItemId,
                Path = persisted.Path,
                IsFavorite = persisted.IsFavorite,
                IsBlacklisted = persisted.IsBlacklisted
            });
            persisted.Revision = envelope.Revision;
            return Results.Ok(persisted);
        });

        app.MapPost("/api/blacklist", (BlacklistRequest request, ServerStateService state, LibraryOperationsService operations) =>
        {
            if (string.IsNullOrWhiteSpace(request.Path))
            {
                return Results.BadRequest(new { error = "path is required" });
            }

            var persisted = operations.SetBlacklist(request.Path, request.IsBlacklisted);
            if (persisted == null)
            {
                return Results.NotFound(new { error = "path not found in library" });
            }

            var envelope = state.PublishExternal("itemStateChanged", new ItemStateChangedPayload
            {
                ItemId = persisted.ItemId,
                Path = persisted.Path,
                IsFavorite = persisted.IsFavorite,
                IsBlacklisted = persisted.IsBlacklisted
            });
            persisted.Revision = envelope.Revision;
            return Results.Ok(persisted);
        });

        app.MapPost("/api/record-playback", (RecordPlaybackRequest request, ServerStateService state, LibraryOperationsService operations) =>
        {
            if (string.IsNullOrWhiteSpace(request.Path))
            {
                return Results.BadRequest(new { error = "path is required" });
            }

            request.ClientId = NormalizeOptionalIdentity(request.ClientId);
            request.SessionId = NormalizeOptionalIdentity(request.SessionId);
            var recorded = operations.RecordPlayback(request.Path);
            if (!recorded.Found)
            {
                return Results.NotFound(new { error = "path not found in library" });
            }

            var envelope = state.PublishExternal("playbackRecorded", new PlaybackRecordedPayload
            {
                Path = request.Path,
                ClientId = request.ClientId,
                SessionId = request.SessionId,
                PlayCount = recorded.PlayCount,
                LastPlayedUtc = recorded.LastPlayedUtc
            });
            return Results.Ok(new
            {
                accepted = true,
                revision = envelope.Revision,
                playCount = recorded.PlayCount,
                lastPlayedUtc = recorded.LastPlayedUtc
            });
        });

        app.MapPost("/api/playback/clear-stats", (ClearPlaybackStatsRequest request, LibraryOperationsService operations, ServerStateService state) =>
        {
            var response = operations.ClearPlaybackStats(request);
            if (response.ClearedCount > 0)
            {
                state.PublishExternal("resyncRequired", new
                {
                    reason = "playbackStatsCleared"
                });
            }

            return Results.Ok(response);
        });

        app.MapPost("/api/library-states", (LibraryStatesRequest request, LibraryOperationsService operations) =>
        {
            request.ClientId = NormalizeOptionalIdentity(request.ClientId);
            request.SessionId = NormalizeOptionalIdentity(request.SessionId);
            var states = operations.GetLibraryStates(request);
            return Results.Ok(states);
        });

        app.MapPost("/api/tag-editor/model", (TagEditorModelRequest request, LibraryOperationsService operations) =>
        {
            var model = operations.GetTagEditorModel(request);
            return Results.Ok(model);
        });

        app.MapPost("/api/tag-editor/apply-item-tags", (ApplyItemTagsRequest request, ServerStateService state, LibraryOperationsService operations) =>
        {
            if (request.ItemIds.Count == 0)
            {
                return Results.BadRequest(new { error = "itemIds must contain at least one id" });
            }

            var accepted = operations.ApplyItemTags(request, out var catalogChanged);
            if (!accepted)
            {
                return Results.Json(new { error = "apply rejected or produced no changes" }, statusCode: StatusCodes.Status409Conflict);
            }

            var itemTagsEnvelope = state.PublishExternal("itemTagsChanged", new ItemTagsChangedPayload
            {
                ItemIds = request.ItemIds,
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
        });

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

            var accepted = operations.RenameTag(request);
            if (!accepted)
            {
                return Results.Json(new { error = "rename tag rejected or produced no changes" }, statusCode: StatusCodes.Status409Conflict);
            }

            _ = state.RenameTagInPresetCatalogOnly(request.OldName, request.NewName);
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

            var accepted = operations.DeleteTag(request);
            if (!accepted)
            {
                return Results.Json(new { error = "delete tag rejected or produced no changes" }, statusCode: StatusCodes.Status409Conflict);
            }

            _ = state.RemoveTagFromPresetCatalogOnly(request.Name);
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

        app.MapPost("/api/tag-editor/sync-catalog", (SyncTagCatalogRequest request, ServerStateService state, LibraryOperationsService operations) =>
        {
            var accepted = operations.SyncTagCatalog(request);
            var model = operations.GetTagEditorModel(new TagEditorModelRequest());
            var envelope = state.PublishExternal("tagCatalogChanged", new TagCatalogChangedPayload
            {
                Reason = "syncCatalog",
                Categories = model.Categories,
                Tags = model.Tags
            });
            return Results.Ok(new
            {
                accepted,
                revision = envelope.Revision,
                categories = model.Categories,
                tags = model.Tags
            });
        });

        app.MapPost("/api/tag-editor/sync-item-tags", (SyncItemTagsRequest request, ServerStateService state, LibraryOperationsService operations) =>
        {
            var accepted = operations.SyncItemTags(request);
            if (!accepted)
            {
                return Results.Json(new { error = "sync item tags rejected or produced no changes" }, statusCode: StatusCodes.Status409Conflict);
            }

            var envelope = state.PublishExternal("itemTagsChanged", new ItemTagsChangedPayload
            {
                ItemIds = request.Items.Select(item => item.ItemId).Where(itemId => !string.IsNullOrWhiteSpace(itemId)).ToList(),
                AddedTags = [],
                RemovedTags = []
            });
            var model = operations.GetTagEditorModel(new TagEditorModelRequest());
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

        app.MapPost("/api/refresh/settings", (RefreshSettingsSnapshot snapshot, CoreSettingsService settings) =>
        {
            return Results.Ok(settings.UpdateRefreshSettings(snapshot));
        });

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

        app.MapPost("/api/autotag/apply", (AutoTagApplyRequest request, LibraryOperationsService operations, ServerStateService state) =>
        {
            var response = operations.ApplyAutoTags(request);
            if (response.AssignmentsAdded > 0)
            {
                state.PublishExternal("itemTagsChanged", new ItemTagsChangedPayload
                {
                    ItemIds = response.ChangedItemPaths,
                    AddedTags = request.Assignments
                        .Select(assignment => assignment.TagName)
                        .Where(tag => !string.IsNullOrWhiteSpace(tag))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList(),
                    RemovedTags = []
                });

                var model = operations.GetTagEditorModel(new TagEditorModelRequest());
                state.PublishExternal("tagCatalogChanged", new TagCatalogChangedPayload
                {
                    Reason = "autotagApply",
                    Categories = model.Categories,
                    Tags = model.Tags
                });
            }

            return Results.Ok(response);
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

        app.MapGet("/api/events", async (HttpContext context, ServerStateService state, ConnectedClientTracker clients, OperatorTestingService testingService) =>
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

            var cancellationToken = context.RequestAborted;
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
            }
            finally
            {
                clients.UnregisterSseClient(connectionId);
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

    private static bool IsTestingControlAuthorized(
        HttpContext context,
        CoreSettingsService settings,
        ServerRuntimeOptions options,
        ServerSessionStore sessions)
    {
        var control = settings.GetControlRuntimeSettings();
        if (!string.Equals(control.AdminAuthMode, "TokenRequired", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (context.Request.Cookies.TryGetValue(options.ControlAdminCookieName, out var cookieValue) &&
            sessions.IsSessionValid(ServerSessionStore.ControlScope, cookieValue, DateTimeOffset.UtcNow))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(control.AdminSharedToken) || !options.AllowLegacyTokenAuth)
        {
            return false;
        }

        var authHeader = context.Request.Headers.Authorization.ToString();
        if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = authHeader["Bearer ".Length..].Trim();
            if (string.Equals(token, control.AdminSharedToken, StringComparison.Ordinal))
            {
                return true;
            }
        }

        var queryToken = context.Request.Query["token"].ToString();
        return !string.IsNullOrWhiteSpace(queryToken) &&
               string.Equals(queryToken, control.AdminSharedToken, StringComparison.Ordinal);
    }
}
