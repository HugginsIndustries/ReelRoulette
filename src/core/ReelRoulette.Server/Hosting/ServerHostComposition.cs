using System.Text.Json;
using ReelRoulette.Server.Auth;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Server.Hosting;

public static class ServerHostComposition
{
    public const string WebClientCorsPolicyName = "ReelRouletteWebClient";

    public static void AddReelRouletteServer(this IServiceCollection services)
    {
        services.AddSingleton<ServerStateService>();
        services.AddSingleton<RefreshPipelineService>();
        services.AddSingleton<ServerSessionStore>();
        services.AddHostedService(sp => sp.GetRequiredService<RefreshPipelineService>());
    }

    public static void MapReelRouletteEndpoints(this WebApplication app, ServerRuntimeOptions options)
    {
        if (options.EnableCors && options.CorsAllowedOrigins.Length > 0)
        {
            app.UseCors(WebClientCorsPolicyName);
        }

        if (options.RequireAuth)
        {
            app.Use((context, next) =>
            {
                var sessions = context.RequestServices.GetRequiredService<ServerSessionStore>();
                return new ServerPairingAuthMiddleware(next, options, sessions).InvokeAsync(context);
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

        app.MapGet("/api/version", (ServerStateService state) =>
        {
            return Results.Ok(state.GetVersion());
        });

        app.MapGet("/api/presets", (ServerStateService state) =>
        {
            return Results.Ok(state.GetPresets());
        });

        app.MapPost("/api/random", (RandomRequest request, ServerStateService state) =>
        {
            if (string.IsNullOrWhiteSpace(request.PresetId))
            {
                return Results.BadRequest(new { error = "presetId is required" });
            }

            return Results.Ok(state.GetRandom(request));
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

        app.MapPost("/api/library-states", (LibraryStatesRequest request, ServerStateService state) =>
        {
            var states = state.GetLibraryStates(request);
            return Results.Ok(states);
        });

        app.MapGet("/api/filter-session", (ServerStateService state) =>
        {
            return Results.Ok(state.GetFilterSessionSnapshot());
        });

        app.MapPost("/api/filter-session", (FilterSessionSnapshot snapshot, ServerStateService state) =>
        {
            state.SetFilterSessionSnapshot(snapshot);
            return Results.Ok();
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

        app.MapGet("/api/refresh/settings", (RefreshPipelineService refresh) =>
        {
            return Results.Ok(refresh.GetSettings());
        });

        app.MapPost("/api/refresh/settings", (RefreshSettingsSnapshot snapshot, RefreshPipelineService refresh) =>
        {
            return Results.Ok(refresh.UpdateSettings(snapshot));
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

    private static async Task WriteSseEnvelopeAsync(
        HttpContext context,
        ServerEventEnvelope envelope,
        JsonSerializerOptions serializerOptions,
        CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(envelope, serializerOptions);
        await context.Response.WriteAsync($"id: {envelope.Revision}\n", cancellationToken);
        await context.Response.WriteAsync($"event: {envelope.EventType}\n", cancellationToken);
        await context.Response.WriteAsync($"data: {json}\n\n", cancellationToken);
        await context.Response.Body.FlushAsync(cancellationToken);
    }
}
