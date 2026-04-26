using System.Text.Json;

namespace ReelRoulette.Server.Contracts;

public sealed class VersionResponse
{
    public string AppVersion { get; set; } = "dev";
    public string ApiVersion { get; set; } = "1";
    public string? AssetsVersion { get; set; }
    public string MinimumCompatibleApiVersion { get; set; } = "0";
    public List<string> SupportedApiVersions { get; set; } = ["1", "0"];
    public List<string> Capabilities { get; set; } = [];
}

public sealed class PresetResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Summary { get; set; }
    public JsonElement? FilterState { get; set; }
}

public sealed class SourceResponse
{
    public string Id { get; set; } = string.Empty;
    public string RootPath { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public bool IsEnabled { get; set; } = true;
}

public sealed class LibraryStatsResponse
{
    public LibraryGlobalStatsResponse Global { get; set; } = new();
    public List<SourceStatsResponse> Sources { get; set; } = [];
}

public sealed class LibraryGlobalStatsResponse
{
    public int TotalVideos { get; set; }
    public int TotalPhotos { get; set; }
    public int TotalMedia { get; set; }
    public int Favorites { get; set; }
    public int Blacklisted { get; set; }
    public int UniquePlayedVideos { get; set; }
    public int UniquePlayedPhotos { get; set; }
    public int UniquePlayedMedia { get; set; }
    public int NeverPlayedVideos { get; set; }
    public int NeverPlayedPhotos { get; set; }
    public int NeverPlayedMedia { get; set; }
    public int TotalPlays { get; set; }
    public int VideosWithAudio { get; set; }
    public int VideosWithoutAudio { get; set; }
}

public sealed class SourceStatsResponse
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

public sealed class UpdateSourceEnabledRequest
{
    public bool IsEnabled { get; set; }
}

public sealed class RandomRequest
{
    public string PresetId { get; set; } = string.Empty;
    public JsonElement? FilterState { get; set; }
    public string? ClientId { get; set; }
    public string? SessionId { get; set; }
    public bool IncludeVideos { get; set; } = true;
    public bool IncludePhotos { get; set; } = true;
    public string? RandomizationMode { get; set; }
}

public sealed class PresetMatchRequest
{
    public JsonElement? FilterState { get; set; }
}

public sealed class PresetMatchResponse
{
    public bool Matched { get; set; }
    public string? PresetId { get; set; }
    public string? PresetName { get; set; }
}

public sealed class RandomResponse
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string MediaType { get; set; } = "video";
    public double? DurationSeconds { get; set; }
    public string MediaUrl { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
}

public sealed class FavoriteRequest
{
    public string Path { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
}

public sealed class BlacklistRequest
{
    public string Path { get; set; } = string.Empty;
    public bool IsBlacklisted { get; set; }
}

public sealed class RecordPlaybackRequest
{
    public string? ClientId { get; set; }
    public string? SessionId { get; set; }
    public string Path { get; set; } = string.Empty;
}

public sealed class PlayItemRequest
{
    public string? ClientId { get; set; }
    public string? SessionId { get; set; }
}

public sealed class ClearPlaybackStatsRequest
{
    public List<string>? ItemPaths { get; set; }
}

public sealed class ClearPlaybackStatsResponse
{
    public int ClearedCount { get; set; }
}

public sealed class RecordPlaybackResult
{
    public bool Found { get; set; }
    public int PlayCount { get; set; }
    public DateTime? LastPlayedUtc { get; set; }
}

public sealed class LibraryStatesRequest
{
    public string? ClientId { get; set; }
    public string? SessionId { get; set; }
    public List<string>? Paths { get; set; }
}

public sealed class LibraryStateResponse
{
    public string ItemId { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
    public long Revision { get; set; }
}

public sealed class PairRequest
{
    public string? Token { get; set; }
}

public sealed class FilterPresetSnapshot
{
    public string Name { get; set; } = string.Empty;
    public JsonElement FilterState { get; set; }
}

public sealed class TagCategorySnapshot
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

public sealed class TagSnapshot
{
    public string Name { get; set; } = string.Empty;
    public string CategoryId { get; set; } = string.Empty;
}

public sealed class ItemTagsSnapshot
{
    public string ItemId { get; set; } = string.Empty;
    public List<string> Tags { get; set; } = [];
}

public sealed class TagEditorModelRequest
{
    public List<string> ItemIds { get; set; } = [];
}

public sealed class TagEditorModelResponse
{
    public List<TagCategorySnapshot> Categories { get; set; } = [];
    public List<TagSnapshot> Tags { get; set; } = [];
    public List<ItemTagsSnapshot> Items { get; set; } = [];
}

public sealed class ApplyItemTagsRequest
{
    public List<string> ItemIds { get; set; } = [];
    public List<string> AddTags { get; set; } = [];
    public List<string> RemoveTags { get; set; } = [];
}

public sealed class UpsertCategoryRequest
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int? SortOrder { get; set; }
}

public sealed class UpsertTagRequest
{
    public string Name { get; set; } = string.Empty;
    public string CategoryId { get; set; } = string.Empty;
}

public sealed class RenameTagRequest
{
    public string OldName { get; set; } = string.Empty;
    public string NewName { get; set; } = string.Empty;
    public string? NewCategoryId { get; set; }
}

public sealed class DeleteTagRequest
{
    public string Name { get; set; } = string.Empty;
}

public sealed class DeleteCategoryRequest
{
    public string CategoryId { get; set; } = string.Empty;
    public string? NewCategoryId { get; set; }
}

public sealed class SyncTagCatalogRequest
{
    public List<TagCategorySnapshot> Categories { get; set; } = [];
    public List<TagSnapshot> Tags { get; set; } = [];
}

public sealed class SyncItemTagsRequest
{
    public List<ItemTagsSnapshot> Items { get; set; } = [];
}

public sealed class RefreshStartRequest
{
    public string Trigger { get; set; } = "manual";
}

public sealed class RefreshStartResponse
{
    public bool Accepted { get; set; }
    public string? Message { get; set; }
    public string? RunId { get; set; }
}

public sealed class RefreshSettingsSnapshot
{
    public bool AutoRefreshEnabled { get; set; } = true;
    public int AutoRefreshIntervalMinutes { get; set; } = 15;
    public bool ForceRescanLoudness { get; set; }
    public bool ForceRescanDuration { get; set; }

    /// <summary>
    /// Max parallel fingerprint hash operations during refresh (clamped server-side).
    /// </summary>
    public int FingerprintScanMaxDegreeOfParallelism { get; set; } = 4;
}

public sealed class BackupSettingsSnapshot
{
    public bool Enabled { get; set; } = true;
    public int MinimumBackupGapMinutes { get; set; } = 360;
    public int NumberOfBackups { get; set; } = 8;
}

public sealed class WebRuntimeSettingsSnapshot
{
    public bool Enabled { get; set; } = true;
    public int Port { get; set; } = 45123;
    public bool BindOnLan { get; set; }
    public string LanHostname { get; set; } = "reel";
    public string AuthMode { get; set; } = "TokenRequired";
    public string? SharedToken { get; set; }
}

public sealed class ControlRuntimeSettingsSnapshot
{
    public string AdminAuthMode { get; set; } = "Off";
    public string? AdminSharedToken { get; set; }
}

public sealed class ControlApplyResult
{
    public bool Accepted { get; set; } = true;
    public bool RestartRequired { get; set; }
    public string Message { get; set; } = "Applied";
    public List<string> Errors { get; set; } = [];
}

public sealed class ApiEventTelemetryEntry
{
    public DateTimeOffset TimestampUtc { get; set; }
    public string Direction { get; set; } = "incoming";
    public string Method { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public int? StatusCode { get; set; }
    public string? EventType { get; set; }
}

public sealed class ConnectedClientsSnapshot
{
    public int ApiPairedSessions { get; set; }
    public int ControlPairedSessions { get; set; }
    public int SseSubscribers { get; set; }
    public List<SessionInfoSnapshot> ApiSessions { get; set; } = [];
    public List<SessionInfoSnapshot> ControlSessions { get; set; } = [];
    public List<SseClientInfoSnapshot> ActiveSseClients { get; set; } = [];
}

public sealed class ControlStatusResponse
{
    public DateTimeOffset ServerTimeUtc { get; set; } = DateTimeOffset.UtcNow;
    public bool IsHealthy { get; set; } = true;
    public string ListenUrl { get; set; } = string.Empty;
    public bool LanExposed { get; set; }
    public ConnectedClientsSnapshot ConnectedClients { get; set; } = new();
    public List<ApiEventTelemetryEntry> IncomingApiEvents { get; set; } = [];
    public List<ApiEventTelemetryEntry> OutgoingApiEvents { get; set; } = [];
    public OperatorTestingStateSnapshot Testing { get; set; } = new();
}

public sealed class SessionInfoSnapshot
{
    public string SessionId { get; set; } = string.Empty;
    public DateTimeOffset CreatedUtc { get; set; }
    public DateTimeOffset LastSeenUtc { get; set; }
    public DateTimeOffset ExpiresUtc { get; set; }
}

public sealed class SseClientInfoSnapshot
{
    public string ConnectionId { get; set; } = string.Empty;
    public string? ClientId { get; set; }
    public string? SessionId { get; set; }
    public string? ClientType { get; set; }
    public string? DeviceName { get; set; }
    public string? UserAgent { get; set; }
    public DateTimeOffset ConnectedUtc { get; set; }
    public string? RemoteAddress { get; set; }
}

public sealed class ServerLogResponse
{
    public string SourcePath { get; set; } = string.Empty;
    public int TotalLinesRead { get; set; }
    public List<string> Lines { get; set; } = [];
}

public sealed class OperatorTestingStateSnapshot
{
    public bool TestingModeEnabled { get; set; }
    public bool ForceApiVersionMismatch { get; set; }
    public bool ForceCapabilityMismatch { get; set; }
    public bool ForceApiUnavailable { get; set; }
    public bool ForceMediaMissing { get; set; }
    public bool ForceSseDisconnect { get; set; }
    public DateTimeOffset LastUpdatedUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class OperatorTestingUpdateRequest
{
    public bool? TestingModeEnabled { get; set; }
    public bool? ForceApiVersionMismatch { get; set; }
    public bool? ForceCapabilityMismatch { get; set; }
    public bool? ForceApiUnavailable { get; set; }
    public bool? ForceMediaMissing { get; set; }
    public bool? ForceSseDisconnect { get; set; }
}

public sealed class OperatorTestingActionResponse
{
    public bool Accepted { get; set; } = true;
    public string Message { get; set; } = "Applied";
    public OperatorTestingStateSnapshot State { get; set; } = new();
}

public sealed class RefreshStageProgress
{
    public string Stage { get; set; } = string.Empty;
    public int Percent { get; set; }
    public string Message { get; set; } = string.Empty;
    public bool IsComplete { get; set; }
}

public sealed class RefreshStatusSnapshot
{
    public bool IsRunning { get; set; }
    public string? RunId { get; set; }
    public string Trigger { get; set; } = "manual";
    public DateTimeOffset? StartedUtc { get; set; }
    public DateTimeOffset? CompletedUtc { get; set; }
    public string? CurrentStage { get; set; }
    public string? LastError { get; set; }
    public List<RefreshStageProgress> Stages { get; set; } = [];
}

public sealed class ServerEventEnvelope
{
    public long Revision { get; set; }
    public string EventType { get; set; } = string.Empty;
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    public object Payload { get; set; } = new { };
}

public sealed class ItemStateChangedPayload
{
    public string ItemId { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
}

public sealed class PlaybackRecordedPayload
{
    public string Path { get; set; } = string.Empty;
    public string? ClientId { get; set; }
    public string? SessionId { get; set; }
    public int? PlayCount { get; set; }
    public DateTime? LastPlayedUtc { get; set; }
}

public sealed class ItemTagsChangedPayload
{
    public List<string> ItemIds { get; set; } = [];
    public List<string> AddedTags { get; set; } = [];
    public List<string> RemovedTags { get; set; } = [];
}

public sealed class SourceStateChangedPayload
{
    public string SourceId { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
}

public sealed class TagCatalogChangedPayload
{
    public string Reason { get; set; } = string.Empty;
    public List<TagCategorySnapshot> Categories { get; set; } = [];
    public List<TagSnapshot> Tags { get; set; } = [];
}

public sealed class RefreshStatusChangedPayload
{
    public RefreshStatusSnapshot Snapshot { get; set; } = new();
}

public sealed class SourceImportRequest
{
    public string RootPath { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
}

public sealed class SourceImportResponse
{
    public bool Accepted { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? SourceId { get; set; }
    public int ImportedCount { get; set; }
    public int UpdatedCount { get; set; }
}

public sealed class DuplicateScanRequest
{
    public string Scope { get; set; } = "CurrentSource";
    public string? SourceId { get; set; }
}

public sealed class DuplicateScanResponse
{
    public List<DuplicateGroupResponse> Groups { get; set; } = [];
    public int ExcludedPending { get; set; }
    public int ExcludedFailed { get; set; }
    public int ExcludedStale { get; set; }
}

public sealed class DuplicateGroupResponse
{
    public string Fingerprint { get; set; } = string.Empty;
    public List<DuplicateGroupItemResponse> Items { get; set; } = [];
}

public sealed class DuplicateGroupItemResponse
{
    public string ItemId { get; set; } = string.Empty;
    public string FullPath { get; set; } = string.Empty;
    public string SourceId { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
    public int PlayCount { get; set; }
    public int TagCount { get; set; }
    public DateTime? LastWriteTimeUtc { get; set; }
}

public sealed class DuplicateApplyRequest
{
    public List<DuplicateApplySelection> Selections { get; set; } = [];
}

public sealed class DuplicateApplySelection
{
    public string KeepItemId { get; set; } = string.Empty;
    public List<string> ItemIds { get; set; } = [];
}

public sealed class DuplicateApplyResponse
{
    public int DeletedOnDisk { get; set; }
    public int RemovedFromLibrary { get; set; }
    public List<DuplicateApplyFailure> Failures { get; set; } = [];
}

public sealed class DuplicateApplyFailure
{
    public string FullPath { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
}

public sealed class AutoTagScanRequest
{
    public bool ScanFullLibrary { get; set; } = true;
    public List<string> ItemIds { get; set; } = [];
}

public sealed class AutoTagScanResponse
{
    public List<AutoTagMatchRowResponse> Rows { get; set; } = [];
}

public sealed class AutoTagMatchRowResponse
{
    public string TagName { get; set; } = string.Empty;
    public int TotalMatchedCount { get; set; }
    public int WouldChangeCount { get; set; }
    public List<AutoTagMatchedFileResponse> Files { get; set; } = [];
}

public sealed class AutoTagMatchedFileResponse
{
    public string FullPath { get; set; } = string.Empty;
    public string DisplayPath { get; set; } = string.Empty;
    public bool NeedsChange { get; set; }
}

public sealed class AutoTagApplyRequest
{
    public List<AutoTagAssignment> Assignments { get; set; } = [];
}

public sealed class AutoTagAssignment
{
    public string TagName { get; set; } = string.Empty;
    public List<string> ItemPaths { get; set; } = [];
}

public sealed class AutoTagApplyResponse
{
    public int AssignmentsAdded { get; set; }
    public List<string> ChangedItemPaths { get; set; } = [];
}

public sealed class ClientLogRequest
{
    public string Source { get; set; } = "desktop";
    public string Level { get; set; } = "info";
    public string Message { get; set; } = string.Empty;
}
