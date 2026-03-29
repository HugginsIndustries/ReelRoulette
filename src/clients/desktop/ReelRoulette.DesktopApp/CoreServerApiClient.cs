using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
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

    public async Task<List<CorePresetResponse>?> GetPresetsAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        using var response = await _httpClient.GetAsync($"{baseUrl.TrimEnd('/')}/api/presets", cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<List<CorePresetResponse>>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CorePresetMatchResponse?> MatchPresetAsync(string baseUrl, CorePresetMatchRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/presets/match", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CorePresetMatchResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<List<CoreSourceResponse>?> GetSourcesAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        using var response = await _httpClient.GetAsync($"{baseUrl.TrimEnd('/')}/api/sources", cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<List<CoreSourceResponse>>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<JsonElement?> GetLibraryProjectionAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        using var response = await _httpClient.GetAsync($"{baseUrl.TrimEnd('/')}/api/library/projection", cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<JsonElement>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreLibraryStatsResponse?> GetLibraryStatsAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        using var response = await _httpClient.GetAsync($"{baseUrl.TrimEnd('/')}/api/library/stats", cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreLibraryStatsResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    private static string? TryReadJsonError(string body)
    {
        try
        {
            var node = JsonNode.Parse(body) as JsonObject;
            return node?["error"]?.GetValue<string>() ?? body;
        }
        catch
        {
            return body;
        }
    }

    public async Task<CoreSourceResponse?> UpdateSourceEnabledAsync(string baseUrl, string sourceId, bool isEnabled, CancellationToken cancellationToken = default)
    {
        var request = new CoreUpdateSourceEnabledRequest { IsEnabled = isEnabled };
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/sources/{Uri.EscapeDataString(sourceId)}/enabled", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreSourceResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<bool> SetFavoriteAsync(string baseUrl, string path, bool isFavorite, CancellationToken cancellationToken = default)
    {
        var request = new { path, isFavorite };
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/favorite", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<CoreLibraryStateResponse?> SetFavoriteWithStateAsync(
        string baseUrl,
        string path,
        bool isFavorite,
        string? clientId = null,
        string? sessionId = null,
        CancellationToken cancellationToken = default)
    {
        var accepted = await SetFavoriteAsync(baseUrl, path, isFavorite, cancellationToken).ConfigureAwait(false);
        if (!accepted)
        {
            return null;
        }

        var states = await GetLibraryStatesAsync(baseUrl, [path], clientId, sessionId, cancellationToken).ConfigureAwait(false);
        return states?.FirstOrDefault(state =>
            string.Equals(state.Path, path, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<bool> SetBlacklistAsync(string baseUrl, string path, bool isBlacklisted, CancellationToken cancellationToken = default)
    {
        var request = new { path, isBlacklisted };
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/blacklist", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<CoreLibraryStateResponse?> SetBlacklistWithStateAsync(
        string baseUrl,
        string path,
        bool isBlacklisted,
        string? clientId = null,
        string? sessionId = null,
        CancellationToken cancellationToken = default)
    {
        var accepted = await SetBlacklistAsync(baseUrl, path, isBlacklisted, cancellationToken).ConfigureAwait(false);
        if (!accepted)
        {
            return null;
        }

        var states = await GetLibraryStatesAsync(baseUrl, [path], clientId, sessionId, cancellationToken).ConfigureAwait(false);
        return states?.FirstOrDefault(state =>
            string.Equals(state.Path, path, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<bool> RecordPlaybackAsync(string baseUrl, string path, string clientId, string? sessionId = null, CancellationToken cancellationToken = default)
    {
        var request = new { path, clientId, sessionId };
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/record-playback", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task<List<CoreLibraryStateResponse>?> GetLibraryStatesAsync(
        string baseUrl,
        List<string>? paths = null,
        string? clientId = null,
        string? sessionId = null,
        CancellationToken cancellationToken = default)
    {
        var request = new CoreLibraryStatesRequest
        {
            ClientId = clientId,
            SessionId = sessionId,
            Paths = paths
        };
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/library-states", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<List<CoreLibraryStateResponse>>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreClearPlaybackStatsResponse?> ClearPlaybackStatsAsync(string baseUrl, CoreClearPlaybackStatsRequest? request = null, CancellationToken cancellationToken = default)
    {
        var payload = request ?? new CoreClearPlaybackStatsRequest();
        using var content = SerializeJson(payload);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/playback/clear-stats", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreClearPlaybackStatsResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<bool> SyncPresetsAsync(string baseUrl, List<CoreFilterPresetSnapshot> presets, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(presets ?? []);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/presets", content, cancellationToken).ConfigureAwait(false);
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

    public async Task<CoreRefreshStartResponse?> StartRefreshAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(new CoreRefreshStartRequest { Trigger = "manual" });
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/refresh/start", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreRefreshStartResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreRefreshStatusSnapshot?> GetRefreshStatusAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        using var response = await _httpClient.GetAsync($"{baseUrl.TrimEnd('/')}/api/refresh/status", cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreRefreshStatusSnapshot>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreRefreshSettingsSnapshot?> GetRefreshSettingsAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        using var response = await _httpClient.GetAsync($"{baseUrl.TrimEnd('/')}/api/refresh/settings", cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreRefreshSettingsSnapshot>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreRefreshSettingsSnapshot?> UpdateRefreshSettingsAsync(string baseUrl, CoreRefreshSettingsSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(snapshot);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/refresh/settings", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreRefreshSettingsSnapshot>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreBackupSettingsSnapshot?> GetBackupSettingsAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        using var response = await _httpClient.GetAsync($"{baseUrl.TrimEnd('/')}/api/backup/settings", cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreBackupSettingsSnapshot>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreBackupSettingsSnapshot?> UpdateBackupSettingsAsync(string baseUrl, CoreBackupSettingsSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(snapshot);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/backup/settings", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreBackupSettingsSnapshot>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreWebRuntimeSettingsSnapshot?> GetWebRuntimeSettingsAsync(string baseUrl, CancellationToken cancellationToken = default)
    {
        using var response = await _httpClient.GetAsync($"{baseUrl.TrimEnd('/')}/api/web-runtime/settings", cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreWebRuntimeSettingsSnapshot>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreWebRuntimeSettingsSnapshot?> UpdateWebRuntimeSettingsAsync(string baseUrl, CoreWebRuntimeSettingsSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(snapshot);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/web-runtime/settings", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreWebRuntimeSettingsSnapshot>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreSourceImportResponse?> ImportSourceAsync(string baseUrl, CoreSourceImportRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/sources/import", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreSourceImportResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreDuplicateScanResponse?> ScanDuplicatesAsync(string baseUrl, CoreDuplicateScanRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/duplicates/scan", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            var snippet = await TryReadErrorSnippetAsync(response, cancellationToken).ConfigureAwait(false);
            var suffix = string.IsNullOrWhiteSpace(snippet) ? string.Empty : $" Response: {snippet}";
            throw new HttpRequestException($"Duplicate scan failed with HTTP {(int)response.StatusCode} ({response.StatusCode}).{suffix}");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreDuplicateScanResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreDuplicateApplyResponse?> ApplyDuplicateSelectionAsync(string baseUrl, CoreDuplicateApplyRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/duplicates/apply", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreDuplicateApplyResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreAutoTagScanResponse?> ScanAutoTagAsync(string baseUrl, CoreAutoTagScanRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/autotag/scan", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreAutoTagScanResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<CoreAutoTagApplyResponse?> ApplyAutoTagAsync(string baseUrl, CoreAutoTagApplyRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/autotag/apply", content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        return await JsonSerializer.DeserializeAsync<CoreAutoTagApplyResponse>(stream, _serializerOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<bool> AppendClientLogAsync(string baseUrl, CoreClientLogRequest request, CancellationToken cancellationToken = default)
    {
        using var content = SerializeJson(request);
        using var response = await _httpClient.PostAsync($"{baseUrl.TrimEnd('/')}/api/logs/client", content, cancellationToken).ConfigureAwait(false);
        return response.IsSuccessStatusCode;
    }

    public async Task ListenToEventsAsync(
        string baseUrl,
        string clientId,
        string? sessionId,
        string? clientType,
        string? deviceName,
        long? lastEventId,
        Func<CoreServerEventEnvelope, Task> onEnvelope,
        Action<string>? log,
        CancellationToken cancellationToken)
    {
        var endpointBuilder = new StringBuilder($"{baseUrl.TrimEnd('/')}/api/events?clientId={Uri.EscapeDataString(clientId)}");
        if (!string.IsNullOrWhiteSpace(sessionId))
        {
            endpointBuilder.Append("&sessionId=").Append(Uri.EscapeDataString(sessionId));
        }
        if (!string.IsNullOrWhiteSpace(clientType))
        {
            endpointBuilder.Append("&clientType=").Append(Uri.EscapeDataString(clientType));
        }
        if (!string.IsNullOrWhiteSpace(deviceName))
        {
            endpointBuilder.Append("&deviceName=").Append(Uri.EscapeDataString(deviceName));
        }

        if (lastEventId.HasValue && lastEventId.Value > 0)
        {
            endpointBuilder.Append("&lastEventId=").Append(lastEventId.Value);
        }

        var endpoint = endpointBuilder.ToString();
        using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
        request.Headers.Accept.ParseAdd("text/event-stream");
        if (lastEventId.HasValue && lastEventId.Value > 0)
        {
            request.Headers.TryAddWithoutValidation("Last-Event-ID", lastEventId.Value.ToString());
        }

        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var reader = new StreamReader(stream);
        var dataBuilder = new StringBuilder();

        // Avoid using StreamReader.EndOfStream in async loops; instead, rely on ReadLineAsync returning null at EOF.
        while (!cancellationToken.IsCancellationRequested)
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

    private static async Task<string> TryReadErrorSnippetAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            var raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(raw))
            {
                return string.Empty;
            }

            var singleLine = raw.Replace(Environment.NewLine, " ").Trim();
            return singleLine.Length > 220 ? singleLine[..220] : singleLine;
        }
        catch
        {
            return string.Empty;
        }
    }
}

public sealed class CoreVersionResponse
{
    public string AppVersion { get; set; } = string.Empty;
    public string ApiVersion { get; set; } = string.Empty;
    public string? AssetsVersion { get; set; }
    public string MinimumCompatibleApiVersion { get; set; } = string.Empty;
    public List<string> SupportedApiVersions { get; set; } = [];
    public List<string> Capabilities { get; set; } = [];
}

public sealed class CoreRandomRequest
{
    public string PresetId { get; set; } = string.Empty;
    public JsonElement? FilterState { get; set; }
    public string? ClientId { get; set; }
    public string? SessionId { get; set; }
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

public sealed class CorePresetResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Summary { get; set; }
    public JsonElement? FilterState { get; set; }
}

public sealed class CorePresetMatchRequest
{
    public JsonElement? FilterState { get; set; }
}

public sealed class CorePresetMatchResponse
{
    public bool Matched { get; set; }
    public string? PresetId { get; set; }
    public string? PresetName { get; set; }
}

public sealed class CoreSourceResponse
{
    public string Id { get; set; } = string.Empty;
    public string RootPath { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public bool IsEnabled { get; set; } = true;
}

public sealed class CoreLibraryStatsResponse
{
    public CoreLibraryGlobalStatsResponse Global { get; set; } = new();
    public List<CoreSourceStatsResponse> Sources { get; set; } = [];
}

public sealed class CoreLibraryGlobalStatsResponse
{
    public int TotalVideos { get; set; }
    public int TotalPhotos { get; set; }
    public int TotalMedia { get; set; }
    public int Favorites { get; set; }
    public int Blacklisted { get; set; }
    public int UniquePlayedMedia { get; set; }
    public int NeverPlayedMedia { get; set; }
    public int TotalPlays { get; set; }
}

public sealed class CoreSourceStatsResponse
{
    public string SourceId { get; set; } = string.Empty;
    public string RootPath { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public bool IsEnabled { get; set; } = true;
    public int TotalVideos { get; set; }
    public int TotalPhotos { get; set; }
    public int TotalMedia { get; set; }
    public int VideosWithAudio { get; set; }
    public int VideosWithoutAudio { get; set; }
    public double TotalDurationSeconds { get; set; }
    public double? AverageDurationSeconds { get; set; }
}

public sealed class CoreUpdateSourceEnabledRequest
{
    public bool IsEnabled { get; set; }
}

public sealed class CoreSourceImportRequest
{
    public string RootPath { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
}

public sealed class CoreSourceImportResponse
{
    public bool Accepted { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? SourceId { get; set; }
    public int ImportedCount { get; set; }
    public int UpdatedCount { get; set; }
}

public sealed class CoreDuplicateScanRequest
{
    public string Scope { get; set; } = "CurrentSource";
    public string? SourceId { get; set; }
}

public sealed class CoreDuplicateScanResponse
{
    public List<CoreDuplicateGroup> Groups { get; set; } = [];
    public int ExcludedPending { get; set; }
    public int ExcludedFailed { get; set; }
    public int ExcludedStale { get; set; }
}

public sealed class CoreDuplicateGroup
{
    public string Fingerprint { get; set; } = string.Empty;
    public List<CoreDuplicateGroupItem> Items { get; set; } = [];
}

public sealed class CoreDuplicateGroupItem
{
    public string ItemId { get; set; } = string.Empty;
    public string FullPath { get; set; } = string.Empty;
    public string SourceId { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
    public int PlayCount { get; set; }
    public int TagCount { get; set; }
}

public sealed class CoreDuplicateApplyRequest
{
    public List<CoreDuplicateApplySelection> Selections { get; set; } = [];
}

public sealed class CoreDuplicateApplySelection
{
    public string KeepItemId { get; set; } = string.Empty;
    public List<string> ItemIds { get; set; } = [];
}

public sealed class CoreDuplicateApplyResponse
{
    public int DeletedOnDisk { get; set; }
    public int RemovedFromLibrary { get; set; }
    public List<CoreDuplicateApplyFailure> Failures { get; set; } = [];
}

public sealed class CoreDuplicateApplyFailure
{
    public string FullPath { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
}

public sealed class CoreAutoTagScanRequest
{
    public bool ScanFullLibrary { get; set; } = true;
    public List<string> ItemIds { get; set; } = [];
}

public sealed class CoreAutoTagScanResponse
{
    public List<CoreAutoTagMatchRow> Rows { get; set; } = [];
}

public sealed class CoreAutoTagMatchRow
{
    public string TagName { get; set; } = string.Empty;
    public int TotalMatchedCount { get; set; }
    public int WouldChangeCount { get; set; }
    public List<CoreAutoTagMatchedFile> Files { get; set; } = [];
}

public sealed class CoreAutoTagMatchedFile
{
    public string FullPath { get; set; } = string.Empty;
    public string DisplayPath { get; set; } = string.Empty;
    public bool NeedsChange { get; set; }
}

public sealed class CoreAutoTagApplyRequest
{
    public List<CoreAutoTagAssignment> Assignments { get; set; } = [];
}

public sealed class CoreAutoTagAssignment
{
    public string TagName { get; set; } = string.Empty;
    public List<string> ItemPaths { get; set; } = [];
}

public sealed class CoreAutoTagApplyResponse
{
    public int AssignmentsAdded { get; set; }
    public List<string> ChangedItemPaths { get; set; } = [];
}

public sealed class CoreClientLogRequest
{
    public string Source { get; set; } = "desktop";
    public string Level { get; set; } = "info";
    public string Message { get; set; } = string.Empty;
}

public sealed class CoreClearPlaybackStatsRequest
{
    public List<string>? ItemPaths { get; set; }
}

public sealed class CoreClearPlaybackStatsResponse
{
    public int ClearedCount { get; set; }
}

public sealed class CoreLibraryStatesRequest
{
    public string? ClientId { get; set; }
    public string? SessionId { get; set; }
    public List<string>? Paths { get; set; }
}

public sealed class CoreLibraryStateResponse
{
    public string ItemId { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
    public long Revision { get; set; }
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
    public string? SessionId { get; set; }
    public int? PlayCount { get; set; }
    public DateTime? LastPlayedUtc { get; set; }
}

public sealed class CoreFilterPresetSnapshot
{
    public string Name { get; set; } = string.Empty;
    public JsonElement FilterState { get; set; }
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

public sealed class CoreSourceStateChangedPayload
{
    public string SourceId { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
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

public sealed class CoreRefreshStartRequest
{
    public string Trigger { get; set; } = "manual";
}

public sealed class CoreRefreshStartResponse
{
    public bool Accepted { get; set; }
    public string? Message { get; set; }
    public string? RunId { get; set; }
}

public sealed class CoreRefreshSettingsSnapshot
{
    public bool AutoRefreshEnabled { get; set; } = true;
    public int AutoRefreshIntervalMinutes { get; set; } = 15;
    public bool ForceRescanLoudness { get; set; }
    public bool ForceRescanDuration { get; set; }
    public int FingerprintScanMaxDegreeOfParallelism { get; set; } = 4;
}

public sealed class CoreBackupSettingsSnapshot
{
    public bool Enabled { get; set; } = true;
    public int MinimumBackupGapMinutes { get; set; } = 360;
    public int NumberOfBackups { get; set; } = 8;
}

public sealed class CoreWebRuntimeSettingsSnapshot
{
    public bool Enabled { get; set; }
    public int Port { get; set; } = 45123;
    public bool BindOnLan { get; set; }
    public string LanHostname { get; set; } = "reel";
    public string AuthMode { get; set; } = "TokenRequired";
    public string? SharedToken { get; set; }
}

public sealed class CoreRefreshStageProgress
{
    public string Stage { get; set; } = string.Empty;
    public int Percent { get; set; }
    public string Message { get; set; } = string.Empty;
    public bool IsComplete { get; set; }
}

public sealed class CoreRefreshStatusSnapshot
{
    public bool IsRunning { get; set; }
    public string? RunId { get; set; }
    public string Trigger { get; set; } = "manual";
    public DateTimeOffset? StartedUtc { get; set; }
    public DateTimeOffset? CompletedUtc { get; set; }
    public string? CurrentStage { get; set; }
    public string? LastError { get; set; }
    public List<CoreRefreshStageProgress> Stages { get; set; } = [];
}

public sealed class CoreRefreshStatusChangedPayload
{
    public CoreRefreshStatusSnapshot Snapshot { get; set; } = new();
}
