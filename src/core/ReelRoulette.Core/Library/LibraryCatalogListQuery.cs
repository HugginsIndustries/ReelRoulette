using System.Globalization;
using System.Text;
using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Filtering;

namespace ReelRoulette.Core.Library;

public enum LibraryListSort
{
    Name,
    LastPlayed,
    PlayCount,
    Duration,
    DateAdded
}

public sealed class LibraryListRequest
{
    public string? Search { get; init; }
    public FilterStateModel? Filter { get; init; }
    public LibraryListSort Sort { get; init; } = LibraryListSort.Name;
    public bool SortDescending { get; init; }
    public int Offset { get; init; }
    public int Limit { get; init; } = 100;
}

public sealed class LibraryListResult
{
    public IReadOnlyList<LibraryCatalogItem> Items { get; init; } = [];
    public int TotalCount { get; init; }
    public int SearchBaselineCount { get; init; }
}

internal static class LibraryCatalogListSql
{
    public const string CollationName = "ORDINAL_IGNORE_CASE";
    private const int PhotoMediaType = (int)MediaTypeValue.Photo;

    public const string FromClause = """
        FROM items
        INNER JOIN sources ON sources.id = items.source_id AND sources.is_enabled != 0
        """;

    public static void RegisterCollation(SqliteConnection connection)
    {
        connection.CreateCollation(
            CollationName,
            (left, right) => StringComparer.OrdinalIgnoreCase.Compare(left, right));
    }

    public static string BuildWhere(
        LibraryListRequest request,
        bool includeFilter,
        bool hasCategories,
        IReadOnlyList<LibraryCatalogTag> catalogTags,
        SqlArgs args)
    {
        var where = new StringBuilder("WHERE 1 = 1");
        AppendSearch(where, request.Search, args);
        if (includeFilter && request.Filter != null)
        {
            AppendFilter(where, request.Filter, hasCategories, catalogTags, args);
        }

        return where.ToString();
    }

    public static string BuildOrderBy(LibraryListRequest request)
    {
        var direction = request.SortDescending ? "DESC" : "ASC";
        var fileName = $"items.file_name COLLATE {CollationName}";
        var primary = request.Sort switch
        {
            LibraryListSort.LastPlayed => $"COALESCE(items.last_played_utc, 0) {direction}",
            LibraryListSort.PlayCount => $"items.play_count {direction}",
            LibraryListSort.Duration => $"COALESCE(items.duration_ticks, 0) {direction}",
            LibraryListSort.DateAdded => $"COALESCE(items.last_write_time_utc, 0) {direction}",
            _ => $"{fileName} {direction}"
        };

        return request.Sort == LibraryListSort.Name
            ? $"ORDER BY {primary}, items.id ASC"
            : $"ORDER BY {primary}, {fileName} ASC, items.id ASC";
    }

    private static void AppendSearch(StringBuilder where, string? search, SqlArgs args)
    {
        if (string.IsNullOrWhiteSpace(search))
        {
            return;
        }

        var folded = args.Add(LibraryCatalogStore.Fold(search));
        where.Append(CultureInfo.InvariantCulture, $" AND (instr(items.file_name_fold, {folded}) > 0 OR instr(items.relative_path_fold, {folded}) > 0)");
    }

    private static void AppendFilter(
        StringBuilder where,
        FilterStateModel filter,
        bool hasCategories,
        IReadOnlyList<LibraryCatalogTag> catalogTags,
        SqlArgs args)
    {
        var included = filter.IncludedSourceIds.Where(id => !string.IsNullOrWhiteSpace(id)).ToList();
        if (included.Count > 0)
        {
            where.Append(" AND (");
            for (var i = 0; i < included.Count; i++)
            {
                if (i > 0)
                {
                    where.Append(" OR ");
                }

                var name = args.Add(included[i]);
                where.Append(CultureInfo.InvariantCulture, $"items.source_id = {name} COLLATE {CollationName}");
            }

            where.Append(')');
        }

        if (filter.ExcludeBlacklisted)
        {
            where.Append(" AND items.is_blacklisted = 0");
        }

        if (filter.FavoritesOnly)
        {
            where.Append(" AND items.is_favorite != 0");
        }

        if (filter.OnlyNeverPlayed)
        {
            where.Append(" AND items.play_count = 0");
        }

        if (filter.AudioFilter == AudioFilterModeValue.WithAudioOnly)
        {
            where.Append(CultureInfo.InvariantCulture, $" AND (items.media_type = {PhotoMediaType} OR items.has_audio = 1)");
        }
        else if (filter.AudioFilter == AudioFilterModeValue.WithoutAudioOnly)
        {
            where.Append(CultureInfo.InvariantCulture, $" AND (items.media_type = {PhotoMediaType} OR items.has_audio = 0)");
        }

        if (filter.MinDuration.HasValue)
        {
            var min = args.Add(filter.MinDuration.Value.Ticks);
            where.Append(CultureInfo.InvariantCulture, $" AND (items.media_type = {PhotoMediaType} OR (items.duration_ticks IS NOT NULL AND items.duration_ticks >= {min}))");
        }

        if (filter.MaxDuration.HasValue)
        {
            var max = args.Add(filter.MaxDuration.Value.Ticks);
            where.Append(CultureInfo.InvariantCulture, $" AND (items.media_type = {PhotoMediaType} OR (items.duration_ticks IS NOT NULL AND items.duration_ticks <= {max}))");
        }

        if (filter.OnlyKnownDuration)
        {
            where.Append(CultureInfo.InvariantCulture, $" AND (items.media_type = {PhotoMediaType} OR items.duration_ticks IS NOT NULL)");
        }

        if (filter.OnlyKnownLoudness)
        {
            where.Append(CultureInfo.InvariantCulture, $" AND (items.media_type = {PhotoMediaType} OR items.integrated_loudness IS NOT NULL)");
        }

        AppendSelectedTags(where, filter, hasCategories, catalogTags, args);
        AppendExcludedTags(where, filter, args);

        if (filter.MediaTypeFilter == MediaTypeFilterValue.VideosOnly)
        {
            where.Append(CultureInfo.InvariantCulture, $" AND items.media_type = {(int)MediaTypeValue.Video}");
        }
        else if (filter.MediaTypeFilter == MediaTypeFilterValue.PhotosOnly)
        {
            where.Append(CultureInfo.InvariantCulture, $" AND items.media_type = {PhotoMediaType}");
        }
    }

    private static void AppendSelectedTags(
        StringBuilder where,
        FilterStateModel filter,
        bool hasCategories,
        IReadOnlyList<LibraryCatalogTag> catalogTags,
        SqlArgs args)
    {
        var selected = filter.SelectedTags.Where(tag => !string.IsNullOrWhiteSpace(tag)).ToList();
        if (selected.Count == 0)
        {
            return;
        }

        if (!hasCategories)
        {
            where.Append(" AND ");
            where.Append(CombineTagExists(selected, filter.TagMatchMode == TagMatchModeValue.Or, args));
            return;
        }

        var tagsByCategory = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var selectedTag in selected)
        {
            var tag = catalogTags.FirstOrDefault(candidate =>
                string.Equals(candidate.Name, selectedTag, StringComparison.OrdinalIgnoreCase));
            var categoryId = tag == null ? string.Empty : tag.CategoryId;
            if (!tagsByCategory.TryGetValue(categoryId, out var group))
            {
                group = [];
                tagsByCategory[categoryId] = group;
            }

            group.Add(selectedTag);
        }

        if (tagsByCategory.Count == 0)
        {
            return;
        }

        var groups = new List<string>();
        foreach (var pair in tagsByCategory)
        {
            var localOr = filter.CategoryLocalMatchModes != null &&
                          filter.CategoryLocalMatchModes.TryGetValue(pair.Key, out var mode) &&
                          mode == TagMatchModeValue.Or;
            groups.Add(CombineTagExists(pair.Value, localOr, args));
        }

        var joiner = filter.GlobalMatchMode == false ? " OR " : " AND ";
        where.Append(" AND (");
        where.Append(string.Join(joiner, groups));
        where.Append(')');
    }

    private static void AppendExcludedTags(StringBuilder where, FilterStateModel filter, SqlArgs args)
    {
        var excluded = filter.ExcludedTags.Where(tag => !string.IsNullOrWhiteSpace(tag)).ToList();
        if (excluded.Count == 0)
        {
            return;
        }

        where.Append(" AND NOT ");
        where.Append(CombineTagExists(excluded, useOr: true, args));
    }

    private static string CombineTagExists(IReadOnlyList<string> tags, bool useOr, SqlArgs args)
    {
        var parts = new string[tags.Count];
        for (var i = 0; i < tags.Count; i++)
        {
            var name = args.Add(tags[i]);
            parts[i] = $"EXISTS (SELECT 1 FROM item_tags WHERE item_tags.item_id = items.id AND item_tags.name = {name} COLLATE {CollationName})";
        }

        var joiner = useOr ? " OR " : " AND ";
        return "(" + string.Join(joiner, parts) + ")";
    }

    internal sealed class SqlArgs
    {
        private readonly List<(string Name, object Value)> _values = [];

        public string Add(object value)
        {
            var name = "$p" + _values.Count.ToString(CultureInfo.InvariantCulture);
            _values.Add((name, value));
            return name;
        }

        public void Bind(SqliteCommand command)
        {
            foreach (var (name, value) in _values)
            {
                command.Parameters.AddWithValue(name, value);
            }
        }
    }
}
