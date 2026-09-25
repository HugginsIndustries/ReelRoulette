using System.Globalization;
using System.Text.Json.Nodes;
using ReelRoulette.Core.Library;

namespace ReelRoulette.Server.Services;

public sealed class LibraryCatalogHost
{
    private readonly LibraryCatalogSession _session;

    private LibraryCatalogHost(LibraryCatalogSession session)
    {
        _session = session;
    }

    public LibraryCatalogSession Session => _session;

    public static LibraryCatalogHost Open(string directory)
    {
        var result = LibraryCatalogStore.Open(directory);
        if (result.Status != LibraryCatalogOpenStatus.Opened || result.Session == null)
        {
            throw new InvalidOperationException(result.Message ?? LibraryCatalogStore.RefusedMessage);
        }

        return new LibraryCatalogHost(result.Session);
    }

    public JsonObject LoadDocument() => _session.BuildDocument();

    public void SaveChanges(JsonObject baseline, JsonObject current)
    {
        _session.RunInTransaction(() =>
        {
            SaveSources(baseline, current);
            SaveCategories(baseline, current);
            SaveTags(baseline, current);
            SaveItems(baseline, current);
        });
    }

    private void SaveSources(JsonObject baseline, JsonObject current)
    {
        var before = IndexById(baseline["sources"] as JsonArray);
        var after = IndexById(current["sources"] as JsonArray);
        foreach (var (id, source) in after)
        {
            if (!before.TryGetValue(id, out var prior))
            {
                var rootPath = Text(source["rootPath"]);
                if (string.IsNullOrWhiteSpace(rootPath))
                {
                    continue;
                }

                _session.InsertSource(id, rootPath, OptionalText(source["displayName"]), Bool(source["isEnabled"], true));
                continue;
            }

            var priorName = OptionalText(prior["displayName"]);
            var nextName = OptionalText(source["displayName"]);
            if (!string.Equals(priorName, nextName, StringComparison.Ordinal))
            {
                _session.SetSourceDisplayName(id, nextName);
            }

            var priorEnabled = Bool(prior["isEnabled"], true);
            var nextEnabled = Bool(source["isEnabled"], true);
            if (priorEnabled != nextEnabled)
            {
                _session.SetSourceEnabled(id, nextEnabled);
            }
        }
    }

    private void SaveCategories(JsonObject baseline, JsonObject current)
    {
        var before = IndexById(baseline["categories"] as JsonArray);
        var after = IndexById(current["categories"] as JsonArray);
        foreach (var (id, category) in after)
        {
            var name = Text(category["name"]);
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            var sort = Int(category["sortOrder"], 0);
            if (!before.TryGetValue(id, out var prior) ||
                !string.Equals(Text(prior["name"]), name, StringComparison.Ordinal) ||
                Int(prior["sortOrder"], 0) != sort)
            {
                _session.UpsertCategory(id, name, sort);
            }
        }

        foreach (var (id, _) in before)
        {
            if (!after.ContainsKey(id))
            {
                _session.DeleteCategory(id, null);
            }
        }
    }

    private void SaveTags(JsonObject baseline, JsonObject current)
    {
        var before = IndexTags(baseline["tags"] as JsonArray);
        var after = IndexTags(current["tags"] as JsonArray);
        foreach (var (fold, tag) in after)
        {
            if (!before.TryGetValue(fold, out var prior))
            {
                _session.UpsertTag(tag.Name, tag.CategoryId);
                continue;
            }

            if (!string.Equals(prior.Name, tag.Name, StringComparison.Ordinal) ||
                !string.Equals(prior.CategoryId, tag.CategoryId, StringComparison.OrdinalIgnoreCase))
            {
                if (!string.Equals(prior.Name, tag.Name, StringComparison.Ordinal))
                {
                    _session.RenameTag(prior.Name, tag.Name, tag.CategoryId);
                }
                else
                {
                    _session.UpsertTag(tag.Name, tag.CategoryId);
                }
            }
        }

        foreach (var (fold, tag) in before)
        {
            if (!after.ContainsKey(fold))
            {
                _session.DeleteTag(tag.Name);
            }
        }
    }

    private void SaveItems(JsonObject baseline, JsonObject current)
    {
        var before = IndexById(baseline["items"] as JsonArray);
        var after = IndexById(current["items"] as JsonArray);
        foreach (var (id, item) in after)
        {
            if (!before.TryGetValue(id, out var prior))
            {
                _session.InsertItem(ToItem(id, item));
                continue;
            }

            if (IdentityChanged(prior, item))
            {
                _session.UpdateItemIdentity(
                    id,
                    Text(item["sourceId"]),
                    Text(item["fullPath"]),
                    Text(item["relativePath"]),
                    Text(item["fileName"]),
                    MediaType(item["mediaType"]));
            }

            var favorite = Bool(item["isFavorite"], false);
            var blacklisted = Bool(item["isBlacklisted"], false);
            var priorFavorite = Bool(prior["isFavorite"], false);
            var priorBlacklisted = Bool(prior["isBlacklisted"], false);
            if (favorite != priorFavorite || blacklisted != priorBlacklisted)
            {
                if (favorite)
                {
                    _session.SetFavorite(id, true);
                }
                else if (blacklisted)
                {
                    _session.SetBlacklist(id, true);
                }
                else
                {
                    if (priorFavorite)
                    {
                        _session.SetFavorite(id, false);
                    }

                    if (priorBlacklisted)
                    {
                        _session.SetBlacklist(id, false);
                    }
                }
            }

            var playCount = Int(item["playCount"], 0);
            var played = Utc(item["lastPlayedUtc"]);
            if (playCount != Int(prior["playCount"], 0) || !SameUtc(played, Utc(prior["lastPlayedUtc"])))
            {
                _session.SetPlayback(id, playCount, played);
            }

            if (FingerprintChanged(prior, item))
            {
                _session.SetFingerprint(
                    id,
                    OptionalText(item["fingerprint"]),
                    Text(item["fingerprintAlgorithm"]),
                    Int(item["fingerprintVersion"], 1),
                    FingerprintStatus(item["fingerprintStatus"]),
                    Utc(item["fingerprintLastUtc"]));
            }

            var duration = DurationTicks(item["duration"]);
            if (duration != DurationTicks(prior["duration"]))
            {
                _session.SetDuration(id, duration);
            }

            if (LoudnessChanged(prior, item))
            {
                _session.SetLoudness(
                    id,
                    OptionalBool(item["hasAudio"]),
                    OptionalDouble(item["integratedLoudness"]),
                    OptionalDouble(item["peakDb"]),
                    OptionalText(item["loudnessError"]));
            }

            var size = OptionalLong(item["fileSizeBytes"]);
            if (size != OptionalLong(prior["fileSizeBytes"]))
            {
                _session.SetFileSize(id, size);
            }

            var written = Utc(item["lastWriteTimeUtc"]);
            if (!SameUtc(written, Utc(prior["lastWriteTimeUtc"])))
            {
                _session.SetLastWriteTime(id, written);
            }

            var tags = TagNames(item["tags"] as JsonArray);
            if (!TagNames(prior["tags"] as JsonArray).SequenceEqual(tags, StringComparer.OrdinalIgnoreCase))
            {
                _session.ReplaceItemTags(id, tags);
            }
        }

        foreach (var (id, _) in before)
        {
            if (!after.ContainsKey(id))
            {
                _session.DeleteItem(id);
            }
        }
    }

    private static LibraryCatalogItem ToItem(string id, JsonObject item)
    {
        return new LibraryCatalogItem
        {
            Id = id,
            SourceId = Text(item["sourceId"]),
            FullPath = Text(item["fullPath"]),
            RelativePath = Text(item["relativePath"]),
            FileName = Text(item["fileName"]),
            DurationTicks = DurationTicks(item["duration"]),
            HasAudio = OptionalBool(item["hasAudio"]),
            IntegratedLoudness = OptionalDouble(item["integratedLoudness"]),
            PeakDb = OptionalDouble(item["peakDb"]),
            IsFavorite = Bool(item["isFavorite"], false),
            IsBlacklisted = Bool(item["isBlacklisted"], false),
            PlayCount = Int(item["playCount"], 0),
            LastPlayedUtc = Utc(item["lastPlayedUtc"]),
            MediaType = MediaType(item["mediaType"]),
            Fingerprint = OptionalText(item["fingerprint"]),
            FingerprintAlgorithm = Text(item["fingerprintAlgorithm"]),
            FingerprintVersion = Int(item["fingerprintVersion"], 1),
            FileSizeBytes = OptionalLong(item["fileSizeBytes"]),
            LastWriteTimeUtc = Utc(item["lastWriteTimeUtc"]),
            FingerprintLastUtc = Utc(item["fingerprintLastUtc"]),
            FingerprintStatus = FingerprintStatus(item["fingerprintStatus"]),
            LoudnessError = OptionalText(item["loudnessError"]),
            Tags = TagNames(item["tags"] as JsonArray)
        };
    }

    private static bool IdentityChanged(JsonObject prior, JsonObject item)
    {
        return !string.Equals(Text(prior["sourceId"]), Text(item["sourceId"]), StringComparison.OrdinalIgnoreCase) ||
               !string.Equals(Text(prior["fullPath"]), Text(item["fullPath"]), StringComparison.Ordinal) ||
               !string.Equals(Text(prior["relativePath"]), Text(item["relativePath"]), StringComparison.Ordinal) ||
               !string.Equals(Text(prior["fileName"]), Text(item["fileName"]), StringComparison.Ordinal) ||
               MediaType(prior["mediaType"]) != MediaType(item["mediaType"]);
    }

    private static bool FingerprintChanged(JsonObject prior, JsonObject item)
    {
        return !string.Equals(OptionalText(prior["fingerprint"]), OptionalText(item["fingerprint"]), StringComparison.OrdinalIgnoreCase) ||
               !string.Equals(Text(prior["fingerprintAlgorithm"]), Text(item["fingerprintAlgorithm"]), StringComparison.OrdinalIgnoreCase) ||
               Int(prior["fingerprintVersion"], 1) != Int(item["fingerprintVersion"], 1) ||
               FingerprintStatus(prior["fingerprintStatus"]) != FingerprintStatus(item["fingerprintStatus"]) ||
               !SameUtc(Utc(prior["fingerprintLastUtc"]), Utc(item["fingerprintLastUtc"]));
    }

    private static bool LoudnessChanged(JsonObject prior, JsonObject item)
    {
        return OptionalBool(prior["hasAudio"]) != OptionalBool(item["hasAudio"]) ||
               !SameDouble(OptionalDouble(prior["integratedLoudness"]), OptionalDouble(item["integratedLoudness"])) ||
               !SameDouble(OptionalDouble(prior["peakDb"]), OptionalDouble(item["peakDb"])) ||
               !string.Equals(OptionalText(prior["loudnessError"]), OptionalText(item["loudnessError"]), StringComparison.Ordinal);
    }

    private static Dictionary<string, JsonObject> IndexById(JsonArray? nodes)
    {
        var map = new Dictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
        if (nodes == null)
        {
            return map;
        }

        foreach (var node in nodes.OfType<JsonObject>())
        {
            var id = Text(node["id"]);
            if (!string.IsNullOrWhiteSpace(id))
            {
                map[id] = node;
            }
        }

        return map;
    }

    private static Dictionary<string, (string Name, string CategoryId)> IndexTags(JsonArray? nodes)
    {
        var map = new Dictionary<string, (string Name, string CategoryId)>(StringComparer.Ordinal);
        if (nodes == null)
        {
            return map;
        }

        foreach (var node in nodes.OfType<JsonObject>())
        {
            var name = Text(node["name"]);
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            map[name.ToLowerInvariant()] = (name, Text(node["categoryId"]));
        }

        return map;
    }

    private static List<string> TagNames(JsonArray? nodes)
    {
        if (nodes == null)
        {
            return [];
        }

        return nodes
            .Select(Text)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .ToList();
    }

    private static string Text(JsonNode? node)
    {
        if (node is null)
        {
            return string.Empty;
        }

        try
        {
            return node.GetValue<string>()?.Trim() ?? string.Empty;
        }
        catch
        {
            try
            {
                return node.ToJsonString().Trim().Trim('"');
            }
            catch
            {
                return string.Empty;
            }
        }
    }

    private static string? OptionalText(JsonNode? node)
    {
        var text = Text(node);
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private static bool Bool(JsonNode? node, bool defaultValue)
    {
        if (node is null)
        {
            return defaultValue;
        }

        try
        {
            return node.GetValue<bool>();
        }
        catch
        {
            return defaultValue;
        }
    }

    private static bool? OptionalBool(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        try
        {
            return node.GetValue<bool>();
        }
        catch
        {
            return null;
        }
    }

    private static int Int(JsonNode? node, int defaultValue)
    {
        if (node is null)
        {
            return defaultValue;
        }

        try
        {
            return node.GetValue<int>();
        }
        catch
        {
            return int.TryParse(Text(node), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
                ? parsed
                : defaultValue;
        }
    }

    private static long? OptionalLong(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        try
        {
            return node.GetValue<long>();
        }
        catch
        {
            return long.TryParse(Text(node), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
                ? parsed
                : null;
        }
    }

    private static double? OptionalDouble(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        try
        {
            return node.GetValue<double>();
        }
        catch
        {
            return double.TryParse(Text(node), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
                ? parsed
                : null;
        }
    }

    private static int MediaType(JsonNode? node)
    {
        if (node is JsonValue value && value.TryGetValue<int>(out var number))
        {
            return number;
        }

        var text = Text(node);
        return text.Equals("Photo", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
    }

    private static int? FingerprintStatus(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        if (node is JsonValue value && value.TryGetValue<int>(out var number))
        {
            return number;
        }

        var text = Text(node);
        return text.Equals("Pending", StringComparison.OrdinalIgnoreCase) ? 0 :
            text.Equals("Ready", StringComparison.OrdinalIgnoreCase) ? 1 :
            text.Equals("Failed", StringComparison.OrdinalIgnoreCase) ? 2 :
            text.Equals("Stale", StringComparison.OrdinalIgnoreCase) ? 3 :
            0;
    }

    private static long? DurationTicks(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        try
        {
            if (node is JsonValue value && value.TryGetValue<TimeSpan>(out var span))
            {
                return span.Ticks;
            }
        }
        catch
        {
            // Fall through to string and numeric forms.
        }

        if (node is JsonValue numeric && numeric.TryGetValue<double>(out var seconds) && !numeric.TryGetValue<string>(out _))
        {
            return TimeSpan.FromSeconds(Math.Max(0, seconds)).Ticks;
        }

        var text = Text(node);
        if (TimeSpan.TryParse(text, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed.Ticks;
        }

        if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsedSeconds))
        {
            return TimeSpan.FromSeconds(Math.Max(0, parsedSeconds)).Ticks;
        }

        return null;
    }

    private static DateTime? Utc(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        try
        {
            var value = node.GetValue<DateTime>();
            return value.Kind == DateTimeKind.Utc ? value : value.ToUniversalTime();
        }
        catch
        {
            var text = Text(node);
            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
            {
                return parsed.Kind == DateTimeKind.Utc ? parsed : parsed.ToUniversalTime();
            }

            return null;
        }
    }

    private static bool SameUtc(DateTime? left, DateTime? right)
    {
        if (left is null || right is null)
        {
            return left is null && right is null;
        }

        return left.Value.Ticks == right.Value.Ticks;
    }

    private static bool SameDouble(double? left, double? right)
    {
        if (left is null || right is null)
        {
            return left is null && right is null;
        }

        return left.Value.Equals(right.Value);
    }
}
