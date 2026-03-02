using System.Text.Json;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<ServerStateService>();

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

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
        return Results.BadRequest(new { error = "presetId is required" });

    return Results.Ok(state.GetRandom(request));
});

app.MapPost("/api/favorite", (FavoriteRequest request, ServerStateService state) =>
{
    if (string.IsNullOrWhiteSpace(request.Path))
        return Results.BadRequest(new { error = "path is required" });

    state.SetFavorite(request);
    return Results.Ok();
});

app.MapPost("/api/blacklist", (BlacklistRequest request, ServerStateService state) =>
{
    if (string.IsNullOrWhiteSpace(request.Path))
        return Results.BadRequest(new { error = "path is required" });

    state.SetBlacklist(request);
    return Results.Ok();
});

app.MapPost("/api/record-playback", (RecordPlaybackRequest request, ServerStateService state) =>
{
    if (string.IsNullOrWhiteSpace(request.Path))
        return Results.BadRequest(new { error = "path is required" });

    state.RecordPlayback(request);
    return Results.Ok();
});

app.MapPost("/api/library-states", (LibraryStatesRequest request, ServerStateService state) =>
{
    var states = state.GetLibraryStates(request);
    return Results.Ok(states);
});

app.MapGet("/api/events", async (HttpContext context, ServerStateService state) =>
{
    context.Response.Headers.Append("Content-Type", "text/event-stream");
    context.Response.Headers.Append("Cache-Control", "no-cache");
    context.Response.Headers.Append("Connection", "keep-alive");

    var cancellationToken = context.RequestAborted;
    var reader = state.Subscribe(cancellationToken);
    var serializerOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
    var lastEventHeader = context.Request.Headers["Last-Event-ID"].ToString();
    var hasLastEvent = long.TryParse(lastEventHeader, out var lastEventRevision);

    // Initial control frame
    await context.Response.WriteAsync("retry: 1000\n\n", cancellationToken);
    await context.Response.Body.FlushAsync(cancellationToken);

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
            var resyncJson = JsonSerializer.Serialize(resyncEnvelope, serializerOptions);
            await context.Response.WriteAsync($"id: {resyncEnvelope.Revision}\n", cancellationToken);
            await context.Response.WriteAsync($"event: {resyncEnvelope.EventType}\n", cancellationToken);
            await context.Response.WriteAsync($"data: {resyncJson}\n\n", cancellationToken);
            await context.Response.Body.FlushAsync(cancellationToken);
        }

        foreach (var missedEvent in replay.Events)
        {
            var replayJson = JsonSerializer.Serialize(missedEvent, serializerOptions);
            await context.Response.WriteAsync($"id: {missedEvent.Revision}\n", cancellationToken);
            await context.Response.WriteAsync($"event: {missedEvent.EventType}\n", cancellationToken);
            await context.Response.WriteAsync($"data: {replayJson}\n\n", cancellationToken);
            await context.Response.Body.FlushAsync(cancellationToken);
        }
    }

    while (await reader.WaitToReadAsync(cancellationToken))
    {
        while (reader.TryRead(out var envelope))
        {
            var json = JsonSerializer.Serialize(envelope, serializerOptions);
            await context.Response.WriteAsync($"id: {envelope.Revision}\n", cancellationToken);
            await context.Response.WriteAsync($"event: {envelope.EventType}\n", cancellationToken);
            await context.Response.WriteAsync($"data: {json}\n\n", cancellationToken);
            await context.Response.Body.FlushAsync(cancellationToken);
        }
    }
});

app.Run();
