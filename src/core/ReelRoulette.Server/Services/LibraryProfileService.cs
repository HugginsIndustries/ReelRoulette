using System.Text.Json;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

/// <summary>
/// The library's profiles, kept in the catalog and read from it on every call: lists and writes them, and resolves a
/// request's profile to the sources it shows. Each write publishes <c>profilesChanged</c> with every profile, within one
/// lock, so events follow the order of the writes.
/// </summary>
public sealed class LibraryProfileService
{
    private readonly LibraryCatalogHost _catalog;
    private readonly ServerStateService _state;
    private readonly ServerLogService? _serverLog;
    private readonly object _writeLock = new();
    private readonly HashSet<string> _loggedUnknownIds = new(StringComparer.Ordinal);

    public LibraryProfileService(LibraryCatalogHost catalog, ServerStateService state, ServerLogService? serverLog = null)
    {
        _catalog = catalog;
        _state = state;
        _serverLog = serverLog;
    }

    /// <summary>Every profile, in the order they were added, so the default profile comes first.</summary>
    public IReadOnlyList<ProfileResponse> GetProfiles()
    {
        return _catalog.Session.ReadProfiles().Select(Map).ToList();
    }

    /// <summary>
    /// The sources a request's profile shows, or null when it shows every source: a profile that follows all sources,
    /// the default profile among them, or a request that names none. An id the catalog doesn't have, such as a profile
    /// another device deleted, is read as the default profile, and <c>last.log</c> gets one line the first time each
    /// such id comes.
    /// </summary>
    public IReadOnlyCollection<string>? ResolveSourceIds(string? profileId)
    {
        if (string.IsNullOrWhiteSpace(profileId))
        {
            return null;
        }

        var profile = _catalog.Session.ReadProfile(profileId);
        if (profile == null)
        {
            bool first;
            lock (_loggedUnknownIds)
            {
                first = _loggedUnknownIds.Add(profileId);
            }

            if (first)
            {
                _serverLog?.Append("info", $"Profile id={profileId} is not in the library; using the default profile.");
            }

            return null;
        }

        return profile.FollowsAllSources ? null : profile.SourceIds;
    }

    /// <summary>
    /// Adds a profile after every other one, with a new id and the default profile's default filter. It is refused for
    /// an empty name or another profile's, ignoring case, and for a color that isn't <c>#rrggbb</c>.
    /// </summary>
    public ProfileWriteResult CreateProfile(
        string? name,
        string? color,
        bool followsAllSources,
        IReadOnlyList<string>? sourceIds,
        string? clientId)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        lock (_writeLock)
        {
            var profiles = _catalog.Session.ReadProfiles();
            var storedColor = NormalizeColor(color);
            var refused = RefuseName(profiles, trimmed, exceptId: null) ?? (storedColor == null ? ColorNotValid() : null);
            if (refused != null)
            {
                return refused;
            }

            var profile = new LibraryCatalogProfile
            {
                Id = Guid.NewGuid().ToString(),
                Name = trimmed,
                Color = storedColor!,
                FollowsAllSources = followsAllSources,
                SourceIds = followsAllSources ? [] : ChosenSources(sourceIds),
                DefaultFilterJson = profiles.FirstOrDefault(IsDefault)?.DefaultFilterJson
            };
            var unsaved = WriteProfileChange($"create of {profile.Id}", session =>
            {
                session.CreateProfile(profile);
                return true;
            });
            return unsaved ?? Changed(profile, clientId);
        }
    }

    /// <summary>
    /// Changes what <paramref name="update"/> names of a profile, keeping the rest. It is refused, as for a new profile,
    /// for an empty name or another profile's and for a color that isn't <c>#rrggbb</c>, for a default filter that isn't
    /// an object, and for a chosen list of sources on the default profile.
    /// </summary>
    public ProfileWriteResult UpdateProfile(string? id, ProfileUpdate update, string? clientId)
    {
        ArgumentNullException.ThrowIfNull(update);
        lock (_writeLock)
        {
            var profiles = _catalog.Session.ReadProfiles();
            var stored = profiles.FirstOrDefault(profile => profile.Id == id);
            if (stored == null)
            {
                return ProfileNotFound();
            }

            var name = update.Name?.Trim() ?? stored.Name;
            var color = update.Color == null ? stored.Color : NormalizeColor(update.Color);
            var refused = RefuseName(profiles, name, stored.Id) ?? (color == null ? ColorNotValid() : null);
            if (refused != null)
            {
                return refused;
            }

            if (update.FollowsAllSources == false && IsDefault(stored))
            {
                return ProfileRefused(ProfileWriteStatus.DefaultProfile, "The default profile always shows every source.");
            }

            var defaultFilter = stored.DefaultFilterJson;
            if (update.DefaultFilter is { ValueKind: not (JsonValueKind.Undefined or JsonValueKind.Null) } filter)
            {
                if (filter.ValueKind != JsonValueKind.Object)
                {
                    return ProfileRefused(ProfileWriteStatus.FilterNotValid, "The default filter isn't a filter the server can read.");
                }

                defaultFilter = filter.GetRawText();
            }

            var followsAll = update.FollowsAllSources ?? stored.FollowsAllSources;
            var profile = new LibraryCatalogProfile
            {
                Id = stored.Id,
                Name = name,
                Color = color!,
                FollowsAllSources = followsAll,
                SourceIds = followsAll ? [] : update.SourceIds == null ? stored.SourceIds : ChosenSources(update.SourceIds),
                DefaultFilterJson = defaultFilter
            };
            var unsaved = WriteProfileChange($"update of {profile.Id}", session => session.UpdateProfile(profile));
            return unsaved ?? Changed(profile, clientId);
        }
    }

    /// <summary>Deletes a profile and its chosen sources. The default profile can't be deleted.</summary>
    public ProfileWriteResult DeleteProfile(string? id, string? clientId)
    {
        lock (_writeLock)
        {
            var stored = _catalog.Session.ReadProfiles().FirstOrDefault(profile => profile.Id == id);
            if (stored == null)
            {
                return ProfileNotFound();
            }

            if (IsDefault(stored))
            {
                return ProfileRefused(ProfileWriteStatus.DefaultProfile, "The default profile can't be deleted.");
            }

            var unsaved = WriteProfileChange($"delete of {stored.Id}", session => session.DeleteProfile(stored.Id));
            return unsaved ?? Changed(stored, clientId);
        }
    }

    private static bool IsDefault(LibraryCatalogProfile profile) =>
        string.Equals(profile.Id, LibraryCatalogStore.DefaultProfileId, StringComparison.Ordinal);

    private static ProfileResponse Map(LibraryCatalogProfile profile)
    {
        return new ProfileResponse
        {
            Id = profile.Id,
            Name = profile.Name,
            Color = profile.Color,
            IsDefault = IsDefault(profile),
            FollowsAllSources = profile.FollowsAllSources,
            SourceIds = [.. profile.SourceIds],
            DefaultFilter = profile.DefaultFilterJson == null ? null : ParseDefaultFilter(profile.DefaultFilterJson)
        };
    }

    private static JsonElement? ParseDefaultFilter(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>The chosen sources a request names, each once, blanks left out.</summary>
    private static List<string> ChosenSources(IReadOnlyList<string>? sourceIds)
    {
        return (sourceIds ?? [])
            .Where(sourceId => !string.IsNullOrWhiteSpace(sourceId))
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>The color as <c>#rrggbb</c> in lower case, or null when it isn't one.</summary>
    private static string? NormalizeColor(string? color)
    {
        var value = color?.Trim() ?? string.Empty;
        return value.Length == 7 && value[0] == '#' && value.Skip(1).All(char.IsAsciiHexDigit)
            ? value.ToLowerInvariant()
            : null;
    }

    /// <summary>Why a profile can't take <paramref name="name"/>: it is empty, or another profile's, ignoring case.</summary>
    private static ProfileWriteResult? RefuseName(IReadOnlyList<LibraryCatalogProfile> profiles, string name, string? exceptId)
    {
        if (name.Length == 0)
        {
            return ProfileRefused(ProfileWriteStatus.NameMissing, "A profile needs a name.");
        }

        var holder = profiles.FirstOrDefault(profile =>
            profile.Id != exceptId && string.Equals(profile.Name, name, StringComparison.OrdinalIgnoreCase));
        return holder == null ? null : ProfileRefused(ProfileWriteStatus.NameTaken, $"Another profile is named \"{holder.Name}\".");
    }

    private static ProfileWriteResult ColorNotValid() =>
        ProfileRefused(ProfileWriteStatus.ColorNotValid, "A profile's color must be a hex color, such as #ef7f22.");

    private static ProfileWriteResult ProfileNotFound() => ProfileRefused(ProfileWriteStatus.NotFound, "That profile no longer exists.");

    private static ProfileWriteResult ProfileRefused(ProfileWriteStatus status, string error) => new() { Status = status, Error = error };

    /// <summary>
    /// Writes one profile change to the catalog. A write that throws, as when another write holds the catalog past its
    /// busy timeout, or that changes no row, as when another request deleted the profile meanwhile, is not saved:
    /// last.log gets a warning, and the caller publishes nothing. Null when the change was saved.
    /// </summary>
    private ProfileWriteResult? WriteProfileChange(string change, Func<LibraryCatalogSession, bool> write)
    {
        string reason;
        try
        {
            if (write(_catalog.Session))
            {
                return null;
            }

            reason = "the profile is no longer in the library.";
        }
        catch (Exception ex)
        {
            reason = ex.Message;
        }

        _serverLog?.Append("warn", $"Profile {change} was not saved: {reason}");
        return ProfileRefused(ProfileWriteStatus.NotSaved, "The server couldn't write to the library.");
    }

    /// <summary>Publishes every profile after a write to <paramref name="profile"/>, naming the client that made it.</summary>
    private ProfileWriteResult Changed(LibraryCatalogProfile profile, string? clientId)
    {
        var profiles = GetProfiles();
        _state.PublishExternal("profilesChanged", new ProfilesChangedPayload { Profiles = [.. profiles], ClientId = clientId });
        return new ProfileWriteResult { Status = ProfileWriteStatus.Done, Profile = Map(profile) };
    }
}

/// <summary>What a profile update changes: each field left null keeps the profile's own.</summary>
public sealed class ProfileUpdate
{
    public string? Name { get; init; }
    public string? Color { get; init; }

    /// <summary>True for all sources, following newly added ones, false for a chosen list.</summary>
    public bool? FollowsAllSources { get; init; }

    /// <summary>The chosen sources, read whenever the profile has a chosen list after the update.</summary>
    public IReadOnlyList<string>? SourceIds { get; init; }

    /// <summary>The profile's new default filter, an object, or null to keep it.</summary>
    public JsonElement? DefaultFilter { get; init; }
}

public enum ProfileWriteStatus
{
    Done,
    NotFound,
    NameMissing,
    NameTaken,
    ColorNotValid,
    FilterNotValid,
    DefaultProfile,
    NotSaved
}

/// <summary>A profile write's outcome: the profile written, or why it was refused.</summary>
public sealed class ProfileWriteResult
{
    public ProfileWriteStatus Status { get; init; }

    /// <summary>The profile as written, or as it was before a delete. Null for a refusal.</summary>
    public ProfileResponse? Profile { get; init; }

    public string? Error { get; init; }
}
