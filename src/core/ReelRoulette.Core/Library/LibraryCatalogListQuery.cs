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
        IReadOnlyList<LibraryCatalogTag> catalogTags,
        SqlArgs args)
    {
        var where = new StringBuilder("WHERE 1 = 1");
        AppendSearch(where, request.Search, args);
        if (includeFilter && request.Filter != null)
        {
            AppendFilter(where, request.Filter, catalogTags, args);
        }

        return where.ToString();
    }

    /// <summary>
    /// Name order is the stored name sort key, which orders like OrdinalIgnoreCase on the file name.
    /// Each sort mode and direction has an index on these expressions in the catalog schema.
    /// </summary>
    public static string BuildOrderBy(LibraryListRequest request)
    {
        var direction = request.SortDescending ? "DESC" : "ASC";
        const string fileName = "items.file_name_sort_key";
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

        AppendSelectedTags(where, filter, catalogTags, args);
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

    /// <summary>
    /// Selected tags become one set of item ids for the whole filter. Each category group is the items that
    /// hold any (local OR) or all (local AND) of its tags, and the groups intersect (global AND) or unite
    /// (global OR). Each item is checked against the set once, so the cost does not grow with the number of
    /// tags. The unary plus keeps SQLite from starting the query from the set, so a page can still walk the
    /// sort index. Tags match by name fold, as the catalog identifies them.
    /// </summary>
    private static void AppendSelectedTags(
        StringBuilder where,
        FilterStateModel filter,
        IReadOnlyList<LibraryCatalogTag> catalogTags,
        SqlArgs args)
    {
        var selected = filter.SelectedTags.Where(tag => !string.IsNullOrWhiteSpace(tag)).ToList();
        if (selected.Count == 0)
        {
            return;
        }

        var foldsByCategory = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var selectedTag in selected)
        {
            var fold = LibraryCatalogStore.Fold(selectedTag);
            var tag = catalogTags.FirstOrDefault(candidate => string.Equals(candidate.NameFold, fold, StringComparison.Ordinal));
            var categoryId = tag == null ? string.Empty : tag.CategoryId;
            if (!foldsByCategory.TryGetValue(categoryId, out var group))
            {
                group = [];
                foldsByCategory[categoryId] = group;
            }

            if (!group.Contains(fold, StringComparer.Ordinal))
            {
                group.Add(fold);
            }
        }

        var sets = new List<string>();
        foreach (var pair in foldsByCategory)
        {
            var localOr = filter.CategoryLocalMatchModes != null &&
                          filter.CategoryLocalMatchModes.TryGetValue(pair.Key, out var mode) &&
                          mode == TagMatchModeValue.Or;
            sets.Add(localOr ? ItemsWithAnyTag(pair.Value, args) : ItemsWithAllTags(pair.Value, args));
        }

        var combine = filter.GlobalMatchMode == false ? " UNION " : " INTERSECT ";
        where.Append(" AND +items.id IN (");
        where.Append(string.Join(combine, sets));
        where.Append(')');
    }

    private static void AppendExcludedTags(StringBuilder where, FilterStateModel filter, SqlArgs args)
    {
        var excluded = filter.ExcludedTags
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Select(LibraryCatalogStore.Fold)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (excluded.Count == 0)
        {
            return;
        }

        where.Append(" AND +items.id NOT IN (");
        where.Append(ItemsWithAnyTag(excluded, args));
        where.Append(')');
    }

    private static string ItemsWithAnyTag(IReadOnlyList<string> folds, SqlArgs args)
    {
        var names = string.Join(", ", folds.Select(fold => args.Add(fold)));
        return $"SELECT item_id FROM item_tags WHERE name_fold IN ({names})";
    }

    /// <summary>The items that hold every one of the folds: those whose matching tags cover as many distinct folds.</summary>
    private static string ItemsWithAllTags(IReadOnlyList<string> folds, SqlArgs args)
    {
        return ItemsWithAnyTag(folds, args) +
               string.Create(CultureInfo.InvariantCulture, $" GROUP BY item_id HAVING COUNT(DISTINCT name_fold) = {folds.Count}");
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

        /// <summary>The bound values as text that differs whenever a value or its type does.</summary>
        public string Describe()
        {
            var builder = new StringBuilder();
            foreach (var (name, value) in _values)
            {
                var text = Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty;
                builder.Append(CultureInfo.InvariantCulture, $"{name}={value.GetType().Name}:{text.Length}:{text};");
            }

            return builder.ToString();
        }
    }
}
