using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ReelRoulette;

public sealed class CoreServerApiClient
{
    private readonly HttpClient _httpClient;
    private readonly JsonSerializerOptions _serializerOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    public CoreServerApiClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<CoreVersionResponse?> GetVersionAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        using var response = await _httpClient.GetAsync($"{baseUrl.TrimEnd('/')}/api/version", cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreVersionResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreRandomResponse?> RequestRandomAsync(string baseUrl, CoreRandomRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/random", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreRandomResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<bool> SetFavoriteAsync(string baseUrl, string path, bool isFavorite, CancellationToken cancellationToken = default)
    {
        var request = new { path, isFavorite };
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/favorite", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> SetBlacklistAsync(string baseUrl, string path, bool isBlacklisted, CancellationToken cancellationToken = default)
    {
        var request = new { path, isBlacklisted };
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/blacklist", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> RecordPlaybackAsync(string baseUrl, string path, string clientId, CancellationToken cancellationToken = default)
    {
        var request = new { path, clientId };
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/record-playback", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> SyncFilterSessionAsync(string baseUrl, CoreFilterSessionSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(snapshot);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/filter-session", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<CoreTagEditorModelResponse?> GetTagEditorModelAsync(string baseUrl, List<string> itemIds, CancellationToken cancellationToken = default)
    {
        var request = new CoreTagEditorModelRequest
        {
            ItemIds = itemIds
        };
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/tag-editor/model", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreTagEditorModelResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<bool> ApplyItemTagsAsync(string baseUrl, CoreApplyItemTagsRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/tag-editor/apply-item-tags", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> UpsertCategoryAsync(string baseUrl, CoreUpsertCategoryRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/tag-editor/upsert-category", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> UpsertTagAsync(string baseUrl, CoreUpsertTagRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/tag-editor/upsert-tag", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> RenameTagAsync(string baseUrl, CoreRenameTagRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/tag-editor/rename-tag", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> DeleteTagAsync(string baseUrl, string tagName, CancellationToken cancellationToken = default)
    {
        var request = new { name = tagName };
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/tag-editor/delete-tag", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> DeleteCategoryAsync(string baseUrl, string categoryId, string? newCategoryId, CancellationToken cancellationToken = default)
    {
        var request = new { categoryId, newCategoryId };
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/tag-editor/delete-category", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> SyncTagCatalogAsync(string baseUrl, CoreSyncTagCatalogRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/tag-editor/sync-catalog", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> SyncItemTagsAsync(string baseUrl, CoreSyncItemTagsRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/tag-editor/sync-item-tags", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task ListenToEventsAsync(
        string baseUrl,
        string clientId,
        Func<CoreServerEventEnvelope, Task> onEnvelope,
        Action<string>? log,
        CancellationToken cancellationToken)
    {
        var endpoint = $"{baseUrl.TrimEnd('/')}/api/events?clientId={Uri.EscapeDataString(clientId)}";
        using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
        request.Headers.Accept.ParseAdd("text/event-stream");

        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var reader = new StreamReader(stream);
        var dataBuilder = new StringBuilder();

        while (!reader.EndOfStream && !cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line == null)
            {
                break;
            }

            if (line.Length == 0)
            {
                if (dataBuilder.Length > 0)
                {
                    var payload = dataBuilder.ToString();
                    dataBuilder.Clear();
                    try
                    {
                        var envelope = JsonSerializer.Deserialize<CoreServerEventEnvelope>(payload, _serializerOptions);
                        if (envelope != null)
                        {
                            await onEnvelope(envelope).ConfigureAwait(false);
                        }
                    }
                    catch (Exception ex)
                    {
                        log?.Invoke($"CoreServerApiClient: Failed to parse SSE payload ({ex.Message})");
                    }
                }

                continue;
            }

            if (line.StartsWith("data:", StringComparison.Ordinal))
            {
                var data = line.Length > 5 ? line[5..].TrimStart() : string.Empty;
                if (dataBuilder.Length > 0)
                {
                    dataBuilder.Append('\n');
                }

                dataBuilder.Append(data);
            }
        }
    }

    private StringContent SerializeJson<T>(T value)
    {
        var json = JsonSerializer.Serialize(value, _serializerOptions);
        return new StringContent(json, Encoding.UTF8, "application/json");
    }
}

public sealed class CoreVersionResponse
{
    public string AppVersion { get; set; } = string.Empty;
    public string ApiVersion { get; set; } = string.Empty;
    public string? AssetsVersion { get; set; }
}

public sealed class CoreRandomRequest
{
    public string PresetId { get; set; } = "all-media";
    public string? ClientId { get; set; }
    public bool IncludeVideos { get; set; } = true;
    public bool IncludePhotos { get; set; } = true;
    public string? RandomizationMode { get; set; }
}

public sealed class CoreRandomResponse
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string MediaType { get; set; } = "video";
    public double? DurationSeconds { get; set; }
    public string MediaUrl { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
}

public sealed class CoreServerEventEnvelope
{
    public long Revision { get; set; }
    public string EventType { get; set; } = string.Empty;
    public DateTimeOffset Timestamp { get; set; }
    public JsonElement Payload { get; set; }
}

public sealed class CoreItemStateChangedPayload
{
    public string ItemId { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
}

public sealed class CorePlaybackRecordedPayload
{
    public string Path { get; set; } = string.Empty;
    public string? ClientId { get; set; }
}

public sealed class CoreFilterPresetSnapshot
{
    public string Name { get; set; } = string.Empty;
    public JsonElement FilterState { get; set; }
}

public sealed class CoreFilterSessionSnapshot
{
    public string? ActivePresetName { get; set; }
    public JsonElement? CurrentFilterState { get; set; }
    public List<CoreFilterPresetSnapshot>? Presets { get; set; }
}

public sealed class CoreTagEditorModelRequest
{
    public List<string> ItemIds { get; set; } = [];
}

public sealed class CoreTagEditorModelResponse
{
    public List<CoreTagCategorySnapshot> Categories { get; set; } = [];
    public List<CoreTagSnapshot> Tags { get; set; } = [];
    public List<CoreItemTagsSnapshot> Items { get; set; } = [];
}

public sealed class CoreTagCategorySnapshot
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

public sealed class CoreTagSnapshot
{
    public string Name { get; set; } = string.Empty;
    public string CategoryId { get; set; } = string.Empty;
}

public sealed class CoreItemTagsSnapshot
{
    public string ItemId { get; set; } = string.Empty;
    public List<string> Tags { get; set; } = [];
}

public sealed class CoreApplyItemTagsRequest
{
    public List<string> ItemIds { get; set; } = [];
    public List<string> AddTags { get; set; } = [];
    public List<string> RemoveTags { get; set; } = [];
}

public sealed class CoreUpsertCategoryRequest
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int? SortOrder { get; set; }
}

public sealed class CoreUpsertTagRequest
{
    public string Name { get; set; } = string.Empty;
    public string CategoryId { get; set; } = string.Empty;
}

public sealed class CoreRenameTagRequest
{
    public string OldName { get; set; } = string.Empty;
    public string NewName { get; set; } = string.Empty;
    public string? NewCategoryId { get; set; }
}

public sealed class CoreItemTagsChangedPayload
{
    public List<string> ItemIds { get; set; } = [];
    public List<string> AddedTags { get; set; } = [];
    public List<string> RemovedTags { get; set; } = [];
}

public sealed class CoreTagCatalogChangedPayload
{
    public string Reason { get; set; } = string.Empty;
    public List<CoreTagCategorySnapshot> Categories { get; set; } = [];
    public List<CoreTagSnapshot> Tags { get; set; } = [];
}

public sealed class CoreSyncTagCatalogRequest
{
    public List<CoreTagCategorySnapshot> Categories { get; set; } = [];
    public List<CoreTagSnapshot> Tags { get; set; } = [];
}

public sealed class CoreSyncItemTagsRequest
{
    public List<CoreItemTagsSnapshot> Items { get; set; } = [];
}
