using System.Text.Json;

namespace ReelRoulette.Server.Contracts;

public sealed class VersionResponse
{
    public string AppVersion { get; set; } = "dev";
    public string ApiVersion { get; set; } = "2";
    public string? AssetsVersion { get; set; }
    public string MinimumCompatibleApiVersion { get; set; } = "2";
    public List<string> SupportedApiVersions { get; set; } = ["2"];
    public List<string> Capabilities { get; set; } = [];
    /// <summary>Whether the server has a library, as <c>/control/status</c> reports it.</summary>
    public string LibraryState { get; set; } = "ready";
    /// <summary>Why there is no library and what to do about it, or null while it is ready.</summary>
    public string? LibraryMessage { get; set; }
}

public sealed class PresetResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
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
    public int Rated { get; set; }
    public int UniquePlayedMedia { get; set; }
    public int NeverPlayedMedia { get; set; }
    public int TotalPlays { get; set; }
    public int VideosWithAudio { get; set; }
    public int VideosWithoutAudio { get; set; }
    public double BaselineLoudnessLufs { get; set; } = -18.0;
}

public sealed class LibraryItemReadRequest
{
    public string? Id { get; set; }
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

/// <summary>A random pick's body, which the cycle route takes too.</summary>
public sealed class RandomRequest
{
    public string PresetId { get; set; } = string.Empty;
    public JsonElement? FilterState { get; set; }

    /// <summary>The device whose random-pick memory the request uses. Requests without one share a memory.</summary>
    public string? ClientId { get; set; }

    public bool IncludeVideos { get; set; } = true;
    public bool IncludePhotos { get; set; } = true;

    /// <summary>The options the pick combines, or null for every option's default.</summary>
    public RandomPickOptionsRequest? Options { get; set; }
}

/// <summary>
/// The options a random pick combines, each defaulting when missing. When the pick reads the options, a window other
/// than 1, 7, 30, 90, or null reads as 30, and a null or unknown tag spread as off.
/// </summary>
public sealed class RandomPickOptionsRequest
{
    public bool Shuffle { get; set; } = true;

    /// <summary>1, 7, 30, or 90 days, or null for until everything has played. Any other value reads as 30.</summary>
    public int? RememberPlaysForDays { get; set; } = 30;

    public bool SpreadByFolder { get; set; } = true;

    /// <summary><c>off</c>, <c>allTags</c>, or <c>byCategory</c>, in any case. Any other value reads as off.</summary>
    public string? SpreadByTags { get; set; } = "off";

    /// <summary>The categories whose tags count under <c>byCategory</c>.</summary>
    public List<string>? SpreadCategoryIds { get; set; } = [];

    public bool FavorLessPlayed { get; set; }
    public bool FavorNewlyAdded { get; set; }
    public bool FavorNewlyCreated { get; set; }
    public bool FavorHigherRated { get; set; }
}

/// <summary>A random pick's answer: the picked item, or null when nothing is eligible, and the cycle numbers after it.</summary>
public sealed class RandomPickResponse
{
    public PlaybackItemResponse? Item { get; set; }
    public RandomPickCycleResponse Cycle { get; set; } = new();
}

/// <summary>A device's Shuffle cycle: the eligible items picked within the window, the eligible items, and those left.</summary>
public sealed class RandomPickCycleResponse
{
    public int Picked { get; set; }
    public int Eligible { get; set; }
    public int Remaining { get; set; }
}

public sealed class RandomResetRequest
{
    /// <summary>The device whose Shuffle memory to clear.</summary>
    public string? ClientId { get; set; }
}

/// <summary>An item to play, as the play route and a random pick give it, with a media token for its file.</summary>
public sealed class PlaybackItemResponse
{
    /// <summary>Full path of the file, which the WebUI's Stats tab shows.</summary>
    public string Id { get; set; } = string.Empty;
    public string ItemId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string MediaType { get; set; } = "video";
    public double? DurationSeconds { get; set; }
    public double? IntegratedLoudness { get; set; }
    public double? PeakDb { get; set; }
    public string MediaUrl { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
    /// <summary>The rating in stars, from 0.5 to 5 in half-star steps, or null for none.</summary>
    public double? Rating { get; set; }
}

public sealed class FavoriteRequest
{
    public string ItemId { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public string? ClientId { get; set; }
}

public sealed class BlacklistRequest
{
    public string ItemId { get; set; } = string.Empty;
    public bool IsBlacklisted { get; set; }
    public string? ClientId { get; set; }
}

public sealed class RatingRequest
{
    public string ItemId { get; set; } = string.Empty;
    /// <summary>The rating in stars, a multiple of 0.5 from 0.5 to 5, or null to clear it.</summary>
    public double? Rating { get; set; }
    public string? ClientId { get; set; }
}

public sealed class ItemRatingResponse
{
    public string ItemId { get; set; } = string.Empty;
    /// <summary>The rating in stars, or null for none.</summary>
    public double? Rating { get; set; }
    /// <summary>The revision of the event the change published, or the current revision when nothing changed.</summary>
    public long Revision { get; set; }
}

public sealed class RecordPlaybackRequest
{
    public string? ClientId { get; set; }
    public string? SessionId { get; set; }
    public string ItemId { get; set; } = string.Empty;
}

public sealed class PlayItemRequest
{
    public string? ClientId { get; set; }
    public string? SessionId { get; set; }

    /// <summary>
    /// Whether the play counts, recording it and publishing <c>playbackRecorded</c>. False only gets a fresh media URL
    /// for an item already playing.
    /// </summary>
    public bool RecordPlayback { get; set; } = true;
}

/// <summary>Names either every item, with <see cref="AllItems"/>, or the items in <see cref="ItemIds"/>, never both.</summary>
public sealed class ClearPlaybackStatsRequest
{
    public bool AllItems { get; set; }
    public List<string>? ItemIds { get; set; }
}

public sealed class ClearPlaybackStatsResponse
{
    /// <summary>How many of the named items are in the library, whether or not they had stats to clear.</summary>
    public int Count { get; set; }
}

public sealed class RecordPlaybackResponse
{
    public bool Accepted { get; set; } = true;
    public string ItemId { get; set; } = string.Empty;
    public long Revision { get; set; }
    public int PlayCount { get; set; }
    public DateTime? LastPlayedUtc { get; set; }
}

public sealed class RecordPlaybackResult
{
    public bool Found { get; set; }
    public string ItemId { get; set; } = string.Empty;
    public int PlayCount { get; set; }
    public DateTime? LastPlayedUtc { get; set; }
    public DateTime? PreviousLastPlayedUtc { get; set; }
}

public sealed class LibraryStateResponse
{
    public string ItemId { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
    public long Revision { get; set; }
}

public sealed class BulkItemStateRequest
{
    public List<string>? ItemIds { get; set; }

    /// <summary><c>favorite</c> or <c>blacklist</c>.</summary>
    public string? Flag { get; set; }

    /// <summary>True sets the flag, false clears it.</summary>
    public bool Value { get; set; }

    public string? ClientId { get; set; }
}

public sealed class BulkRatingRequest
{
    public List<string>? ItemIds { get; set; }

    /// <summary>The rating in stars, a multiple of 0.5 from 0.5 to 5, or null to clear it.</summary>
    public double? Rating { get; set; }

    public string? ClientId { get; set; }
}

public sealed class BulkChangeResponse
{
    /// <summary>How many of the named items are in the library, each of which now has the requested state.</summary>
    public int Count { get; set; }
}

public sealed class DeleteFilesRequest
{
    public List<string>? ItemIds { get; set; }
}

public sealed class DeleteFilesResponse
{
    /// <summary>How many files were deleted, each of whose items was removed from the library.</summary>
    public int DeletedCount { get; set; }

    /// <summary>The items whose file wasn't on disk or couldn't be deleted. They stay in the library.</summary>
    public List<string> FailedItemIds { get; set; } = [];
}

public sealed class PairRequest
{
    public string? Token { get; set; }
}

public sealed class CreatePresetRequest
{
    public string? Name { get; set; }
    public JsonElement? FilterState { get; set; }
    public string? ClientId { get; set; }
}

public sealed class UpdatePresetFilterRequest
{
    public JsonElement? FilterState { get; set; }
    public string? ClientId { get; set; }
}

public sealed class RenamePresetRequest
{
    public string? Name { get; set; }
    public string? ClientId { get; set; }
}

public sealed class ReorderPresetsRequest
{
    /// <summary>Every preset's id, once each, in the new order.</summary>
    public List<string>? PresetIds { get; set; }
    public string? ClientId { get; set; }
}

public sealed class DeletePresetRequest
{
    public string? ClientId { get; set; }
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

public sealed class TagEditorModelRequest
{
    /// <summary>The items to count tags across; none reads the tag catalog alone.</summary>
    public List<string> ItemIds { get; set; } = [];
}

public sealed class TagEditorModelResponse
{
    public List<TagCategorySnapshot> Categories { get; set; } = [];
    public List<TagSnapshot> Tags { get; set; } = [];

    /// <summary>Each tag the requested items hold and how many of them hold it.</summary>
    public List<TagItemCount> TagCounts { get; set; } = [];

    /// <summary>How many of the requested items are in the library.</summary>
    public int ItemCount { get; set; }
}

public sealed class TagItemCount
{
    /// <summary>The tag's name as the items hold it.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>How many of the requested items hold the tag, compared ignoring case.</summary>
    public int ItemCount { get; set; }
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
    public bool MdnsEnabled { get; set; } = true;
    public string LanHostname { get; set; } = "reel";
    public string AuthMode { get; set; } = "TokenRequired";
    public string? SharedToken { get; set; }
}

public sealed class ControlRuntimeSettingsSnapshot
{
    /// <summary>Read-only: always <c>TokenRequired</c>. A posted value is ignored.</summary>
    public string AdminAuthMode { get; set; } = "TokenRequired";
    public string? AdminSharedToken { get; set; }
    public bool? DevChannelEnabled { get; set; }
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
    public string LibraryState { get; set; } = "ready";
    public string? LibraryMessage { get; set; }
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
    /// <summary>The sources this run kept because their folder listed no media files while the library held items from them.</summary>
    public List<RefreshKeptSource> KeptSources { get; set; } = [];
}

/// <summary>A source whose items a refresh kept because its folder listed no media files, such as a share that isn't mounted.</summary>
public sealed class RefreshKeptSource
{
    public string SourceId { get; set; } = string.Empty;
    /// <summary>How many of the library's items from the source were kept.</summary>
    public int ItemCount { get; set; }
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
    public bool PreviousIsFavorite { get; set; }
    public bool PreviousIsBlacklisted { get; set; }
    /// <summary>The client that made the change, when its request named one.</summary>
    public string? ClientId { get; set; }
}

public sealed class BulkItemStateChangedPayload
{
    /// <summary><c>favorite</c> or <c>blacklist</c>, the flag the request set or cleared.</summary>
    public string Flag { get; set; } = string.Empty;

    /// <summary>True when the request set the flag, false when it cleared it.</summary>
    public bool Value { get; set; }

    /// <summary>How many of the named items are in the library, each of which now has the requested state.</summary>
    public int Count { get; set; }

    /// <summary>The items whose favorite or blacklist this change changed.</summary>
    public List<BulkItemState> Items { get; set; } = [];

    /// <summary>The client that made the change, when its request named one.</summary>
    public string? ClientId { get; set; }
}

public sealed class BulkItemState
{
    public string ItemId { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
    public bool PreviousIsFavorite { get; set; }
    public bool PreviousIsBlacklisted { get; set; }
}

public sealed class BulkItemRatingChangedPayload
{
    /// <summary>The rating the request set, in stars, or null when it cleared the rating.</summary>
    public double? Rating { get; set; }

    /// <summary>How many of the named items are in the library, each of which now has the requested rating.</summary>
    public int Count { get; set; }

    /// <summary>The items whose rating this change changed.</summary>
    public List<BulkItemRating> Items { get; set; } = [];

    /// <summary>The client that made the change, when its request named one.</summary>
    public string? ClientId { get; set; }
}

public sealed class BulkItemRating
{
    public string ItemId { get; set; } = string.Empty;

    /// <summary>The rating in stars, or null for none.</summary>
    public double? Rating { get; set; }

    /// <summary>The rating before this change, in stars, or null for none.</summary>
    public double? PreviousRating { get; set; }
}

public sealed class ItemsRemovedPayload
{
    public List<string> ItemIds { get; set; } = [];
}

public sealed class ItemRatingChangedPayload
{
    public string ItemId { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    /// <summary>The rating in stars, or null for none.</summary>
    public double? Rating { get; set; }
    /// <summary>The rating before this change, in stars, or null for none.</summary>
    public double? PreviousRating { get; set; }
    /// <summary>The client that made the change, when its request named one.</summary>
    public string? ClientId { get; set; }
}

public sealed class PlaybackRecordedPayload
{
    public string ItemId { get; set; } = string.Empty;
    public string? ClientId { get; set; }
    public string? SessionId { get; set; }
    public int? PlayCount { get; set; }
    public DateTime? LastPlayedUtc { get; set; }
    public DateTime? PreviousLastPlayedUtc { get; set; }
}

public sealed class ItemTagsChangedPayload
{
    public List<string> ResolvedItemIds { get; set; } = [];
    public List<string> AddedTags { get; set; } = [];
    public List<string> RemovedTags { get; set; } = [];
    public string? CatalogReplacedTag { get; set; }
    public string? CatalogReplacementTag { get; set; }
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

public sealed class PresetCatalogChangedPayload
{
    /// <summary>The preset created, updated, renamed, or deleted, or null when the presets were reordered.</summary>
    public string? PresetId { get; set; }

    /// <summary>The client whose request changed the presets, so it can tell its own change from another device's.</summary>
    public string? ClientId { get; set; }
}

public sealed class RefreshStatusChangedPayload
{
    public RefreshStatusSnapshot Snapshot { get; set; } = new();
}

public sealed class StreamOpenedPayload
{
    public long CurrentRevision { get; set; }
}

/// <summary>Tells a client to read its state again, after a revision gap or in place of events it wasn't sent.</summary>
public sealed class ResyncRequiredPayload
{
    public const string EventType = "resyncRequired";
    public const string RevisionGap = "revisionGap";
    public const string PlaybackStatsCleared = "playbackStatsCleared";

    /// <summary><see cref="RevisionGap"/>, <see cref="PlaybackStatsCleared"/>, or the type of the event it replaces.</summary>
    public string Reason { get; set; } = string.Empty;

    /// <summary>For a revision gap, the client's last event ID; when published, the revision before this event's.</summary>
    public long LastEventId { get; set; }

    /// <summary>For a revision gap, the server's revision when the gap was found; when published, this event's revision.</summary>
    public long CurrentRevision { get; set; }
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
    public string ItemId { get; set; } = string.Empty;
    public string FullPath { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
}

public sealed class AutoTagScanRequest
{
    public bool ScanFullLibrary { get; set; } = true;
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
    public string ItemId { get; set; } = string.Empty;
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

public sealed class AutoTagAppliedAssignment
{
    public string TagName { get; set; } = string.Empty;
    public List<string> ChangedItemIds { get; set; } = [];
}

public sealed class AutoTagApplyResponse
{
    public List<AutoTagAppliedAssignment> Applied { get; set; } = [];
}

public sealed class ClientLogRequest
{
    public string Source { get; set; } = string.Empty;
    public string Level { get; set; } = "info";
    public string Message { get; set; } = string.Empty;
}

public sealed class LibraryQueryRequest
{
    public JsonElement? FilterState { get; set; }
    public string? Search { get; set; }
    public string? SortMode { get; set; }
    public bool? SortDescending { get; set; }
    public int? Offset { get; set; }
    public int? Limit { get; set; }
}

public sealed class LibraryIdsQueryRequest
{
    public JsonElement? FilterState { get; set; }
    public string? Search { get; set; }

    /// <summary>When set, only these ids are answered, those that match, as when checking a selection.</summary>
    public List<string>? ItemIds { get; set; }
}

public sealed class LibraryIdsQueryResponse
{
    /// <summary>The catalog id of every item the query matches.</summary>
    public List<string> Ids { get; set; } = [];
}

public sealed class LibraryItemSummaryRequest
{
    public List<string>? ItemIds { get; set; }
}

/// <summary>How many of the named items are in the library, and how many of those are in each state.</summary>
public sealed class LibraryItemSummaryResponse
{
    public int Count { get; set; }
    public int FavoriteCount { get; set; }
    public int BlacklistedCount { get; set; }

    /// <summary>How many have playback stats to clear: a play count or a last played time.</summary>
    public int PlayedCount { get; set; }
}
