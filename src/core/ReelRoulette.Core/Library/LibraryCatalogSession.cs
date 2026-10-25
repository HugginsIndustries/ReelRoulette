using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Randomization;
using ReelRoulette.Core.Storage;

namespace ReelRoulette.Core.Library;

public sealed class LibraryCatalogSession
{
    private const int ItemIdChunk = 500;
    private const double DefaultBaselineLoudnessLufs = -18.0;
    private const int ListCountCacheCapacity = 64;

    private readonly string _databasePath;
    private readonly AsyncLocal<WriteScope?> _writeScope = new();
    private readonly object _listCountLock = new();
    private readonly Dictionary<string, int> _listCounts = new(StringComparer.Ordinal);
    private long _listCountRevision = -1;
    private int _listCountQueries;

    public LibraryCatalogSession(string databasePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(databasePath);
        _databasePath = databasePath;
    }

    public string DatabasePath => _databasePath;

    public Action? AfterSuccessfulWrite { get; set; }

    /// <summary>
    /// The clock and time zone a filter's date ranges resolve against: the server's own, or one a test sets.
    /// </summary>
    internal TimeProvider Time { get; set; } = TimeProvider.System;

    public long Revision
    {
        get
        {
            using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
            return ReadRevision(connection);
        }
    }

    /// <summary>How many count queries <see cref="QueryList"/> has run, so tests can see the cache work.</summary>
    internal int ListCountQueries => Volatile.Read(ref _listCountQueries);

    /// <summary>
    /// One page of the browse query, with the counts after search and after search and filter. The
    /// counts are cached by catalog revision, so later pages of the same query do not count again; every
    /// committed write raises the revision. The page, the counts, and the revision come from one read.
    /// </summary>
    public LibraryListResult QueryList(LibraryListRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        LibraryCatalogListSql.RegisterCollation(connection);
        using var transaction = connection.BeginTransaction(deferred: true);

        var revision = ReadRevision(connection);
        var catalogTags = ReadCatalogTags(connection);

        // One reading of the clock, so the counts and the page keep the same days.
        var clock = FilterClock.From(Time);
        var searchArgs = new LibraryCatalogListSql.SqlArgs();
        var searchWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: false, catalogTags, clock, searchArgs);
        var searchBaselineCount = CachedListCount(connection, revision, searchWhere, searchArgs);

        var filterArgs = new LibraryCatalogListSql.SqlArgs();
        var filterWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, catalogTags, clock, filterArgs);
        var totalCount = CachedListCount(connection, revision, filterWhere, filterArgs);

        var pageArgs = new LibraryCatalogListSql.SqlArgs();
        var pageWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, catalogTags, clock, pageArgs);
        var orderBy = LibraryCatalogListSql.BuildOrderBy(request);
        var limit = pageArgs.Add(request.Limit);
        var offset = pageArgs.Add(request.Offset);
        using var command = connection.CreateCommand();
        command.CommandText = ListPageSql(pageWhere, orderBy, limit, offset);
        pageArgs.Bind(command);
        var items = new List<LibraryCatalogItem>();
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                items.Add(ReadListedItem(reader));
            }
        }

        AttachTags(connection, items);
        transaction.Commit();
        return new LibraryListResult
        {
            Items = items,
            TotalCount = totalCount,
            SearchBaselineCount = searchBaselineCount
        };
    }

    /// <summary>
    /// The id of every item the browse query with the same search and filter matches, with no page, no cap, and no
    /// order, from one read.
    /// </summary>
    public List<string> QueryListIds(LibraryListRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        LibraryCatalogListSql.RegisterCollation(connection);
        using var transaction = connection.BeginTransaction(deferred: true);

        var catalogTags = ReadCatalogTags(connection);
        var args = new LibraryCatalogListSql.SqlArgs();
        var where = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, catalogTags, FilterClock.From(Time), args);
        var ids = new List<string>();
        using (var command = connection.CreateCommand())
        {
            command.CommandText = ListIdsSql(where);
            args.Bind(command);
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                ids.Add(reader.GetString(0));
            }
        }

        transaction.Commit();
        return ids;
    }

    /// <summary>
    /// The columns the browse page and an item's read select, which <see cref="ReadListedItem(SqliteDataReader)"/>
    /// reads by position.
    /// </summary>
    private const string ListedItemColumnsSql = """
        items.id, items.source_id, items.full_path, items.full_path_fold, items.relative_path, items.relative_path_fold,
        items.file_name, items.file_name_fold, items.duration_ticks, items.has_audio, items.integrated_loudness, items.peak_db,
        items.is_favorite, items.is_blacklisted, items.play_count, items.last_played_utc, items.media_type, items.fingerprint,
        items.fingerprint_algorithm, items.fingerprint_version, items.file_size_bytes, items.last_write_time_utc,
        items.fingerprint_last_utc, items.fingerprint_status, items.loudness_error,
        items.thumbnail_revision, items.thumbnail_width, items.thumbnail_height, items.rating, items.date_added_utc
        """;

    /// <summary>The browse page query.</summary>
    internal static string ListPageSql(string where, string orderBy, string limit, string offset) => $"""
        SELECT {ListedItemColumnsSql}
        {LibraryCatalogListSql.FromClause}
        {where}
        {orderBy}
        LIMIT {limit} OFFSET {offset};
        """;

    /// <summary>The browse count query.</summary>
    internal static string ListCountSql(string where) => $"SELECT COUNT(*) {LibraryCatalogListSql.FromClause} {where};";

    /// <summary>The ids query for selecting every match.</summary>
    internal static string ListIdsSql(string where) => $"SELECT items.id {LibraryCatalogListSql.FromClause} {where};";

    /// <summary>The random candidates query.</summary>
    internal static string RandomCandidatesSql(string where) => $"""
        SELECT items.id, items.full_path, items.play_count, items.last_played_utc,
               items.date_added_utc, items.last_write_time_utc, items.rating
        {LibraryCatalogListSql.FromClause}
        {where};
        """;

    private int CachedListCount(SqliteConnection connection, long revision, string where, LibraryCatalogListSql.SqlArgs args)
    {
        var key = where + "\u0000" + args.Describe();
        lock (_listCountLock)
        {
            if (_listCountRevision == revision && _listCounts.TryGetValue(key, out var cached))
            {
                return cached;
            }
        }

        var count = ScalarCount(connection, where, args);
        Interlocked.Increment(ref _listCountQueries);
        lock (_listCountLock)
        {
            if (revision < _listCountRevision)
            {
                return count;
            }

            if (revision != _listCountRevision || _listCounts.Count >= ListCountCacheCapacity)
            {
                _listCounts.Clear();
                _listCountRevision = revision;
            }

            _listCounts[key] = count;
        }

        return count;
    }

    private static long ReadRevision(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT value FROM catalog_meta WHERE key = 'revision';";
        var value = command.ExecuteScalar() as string;
        return long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var revision) ? revision : 0;
    }

    /// <summary>
    /// The items random selection picks from: the list filter over enabled sources, plus the media type,
    /// with only the columns selection reads, in ordinal id order. The order is applied here rather than
    /// with ORDER BY, which walks the id index and looks up every row. With <paramref name="includeTags"/>, each
    /// item also gets its tags, each with its category from the tag catalog, or none for a tag the catalog doesn't
    /// have. Everything comes from one read.
    /// </summary>
    public List<RandomizationItem> QueryRandomCandidates(
        FilterStateModel filter,
        MediaTypeValue? requiredMediaType = null,
        bool includeTags = false)
    {
        ArgumentNullException.ThrowIfNull(filter);
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        LibraryCatalogListSql.RegisterCollation(connection);
        using var transaction = connection.BeginTransaction(deferred: true);

        var request = new LibraryListRequest { Filter = filter };
        var catalogTags = ReadCatalogTags(connection);
        var args = new LibraryCatalogListSql.SqlArgs();
        var where = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, catalogTags, FilterClock.From(Time), args);
        if (requiredMediaType.HasValue)
        {
            where += " AND items.media_type = " + ((int)requiredMediaType.Value).ToString(CultureInfo.InvariantCulture);
        }

        var items = new List<RandomizationItem>();
        using (var command = connection.CreateCommand())
        {
            command.CommandText = RandomCandidatesSql(where);
            args.Bind(command);
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                items.Add(new RandomizationItem
                {
                    Id = reader.GetString(0),
                    FullPath = reader.GetString(1),
                    PlayCount = reader.GetInt32(2),
                    LastPlayedUtc = LibraryCatalogStore.ReadUtc(reader, 3),
                    DateAddedUtc = LibraryCatalogStore.ReadUtc(reader, 4),
                    DateCreatedUtc = LibraryCatalogStore.ReadUtc(reader, 5),
                    RatingHalfStars = reader.IsDBNull(6) ? null : reader.GetInt32(6)
                });
            }
        }

        if (includeTags)
        {
            AttachRandomizationTags(connection, catalogTags, items);
        }

        transaction.Commit();
        items.Sort(static (left, right) => string.CompareOrdinal(left.Id, right.Id));
        return items;
    }

    /// <summary>
    /// Reads every item's tags once and gives each candidate its own, in their order, with each tag's category from the
    /// first catalog tag of its fold, as the filter matches them, or none when the catalog has no such tag.
    /// </summary>
    private static void AttachRandomizationTags(
        SqliteConnection connection,
        IReadOnlyList<LibraryCatalogTag> catalogTags,
        List<RandomizationItem> items)
    {
        var categoryByFold = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var tag in catalogTags)
        {
            categoryByFold.TryAdd(tag.NameFold, tag.CategoryId);
        }

        Dictionary<string, List<string>> foldsByItem;
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT item_id, name_fold FROM item_tags ORDER BY item_id, position;";
            foldsByItem = LibraryCatalogStore.ReadTagGroups(command);
        }

        foreach (var item in items)
        {
            if (!foldsByItem.TryGetValue(item.Id, out var folds))
            {
                continue;
            }

            var tags = new RandomizationTag[folds.Count];
            for (var i = 0; i < folds.Count; i++)
            {
                tags[i] = new RandomizationTag(folds[i], categoryByFold.GetValueOrDefault(folds[i], string.Empty));
            }

            item.Tags = tags;
        }
    }

    public LibraryCatalogItem? ReadListedItem(string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return null;
        }

        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        LibraryCatalogItem? item;
        using (var command = connection.CreateCommand())
        {
            command.CommandText = $"""
                SELECT {ListedItemColumnsSql}
                FROM items
                WHERE items.id = $id
                LIMIT 1;
                """;
            command.Parameters.AddWithValue("$id", identifier.Trim());
            using var reader = command.ExecuteReader();
            item = reader.Read() ? ReadListedItem(reader) : null;
        }

        if (item == null)
        {
            return null;
        }

        AttachTags(connection, [item]);
        return item;
    }

    public int CountItems()
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        return LibraryCatalogStore.ExecuteScalarInt(connection, "SELECT COUNT(*) FROM items;");
    }

    /// <summary>
    /// Global and per-source figures from one pass over the items, grouped by source id and media type.
    /// An item counts toward the source whose id it holds, and is a photo when its media type is photo
    /// and a video otherwise.
    /// </summary>
    public CatalogLibraryStats ReadLibraryStats()
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var transaction = connection.BeginTransaction(deferred: true);
        var groups = ReadStatsGroups(connection);
        var stats = new CatalogLibraryStats
        {
            Global = BuildGlobalStats(groups, ReadBaselineLoudness(connection)),
            Sources = BuildSourceStats(connection, groups)
        };
        transaction.Commit();
        return stats;
    }

    public IReadOnlyList<string> ReadAutoTagNames()
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT name FROM tags ORDER BY position;";
        using var reader = command.ExecuteReader();
        var names = new List<string>();
        while (reader.Read())
        {
            if (!reader.IsDBNull(0))
            {
                names.Add(reader.GetString(0));
            }
        }

        return names;
    }

    public IReadOnlyList<CatalogAutoTagScanItem> ReadAutoTagScanItems(CatalogAutoTagScanScope scope)
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = scope == CatalogAutoTagScanScope.EnabledSources
            ? """
              SELECT items.id, items.full_path, items.relative_path, items.file_name
              FROM items
              WHERE EXISTS (
                  SELECT 1 FROM sources
                  WHERE sources.is_enabled != 0
                    AND sources.id = items.source_id COLLATE NOCASE)
              ORDER BY items.position
              """
            : """
              SELECT id, full_path, relative_path, file_name
              FROM items
              ORDER BY position
              """;
        var items = ReadAutoTagItems(command);
        if (items.Count == 0)
        {
            return items;
        }

        var tags = ReadAllItemTags(connection);
        foreach (var item in items)
        {
            if (tags.TryGetValue(item.Id, out var names))
            {
                item.Tags.AddRange(names);
            }
        }

        return items;
    }

    public IReadOnlyList<CatalogDuplicateScanItem> ReadDuplicateScanItems(CatalogDuplicateScanScope scope, string? sourceId)
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var command = connection.CreateCommand();
        var where = scope switch
        {
            CatalogDuplicateScanScope.EnabledSources => """
                WHERE EXISTS (
                    SELECT 1 FROM sources
                    WHERE sources.is_enabled != 0
                      AND sources.id = items.source_id COLLATE NOCASE)
                """,
            CatalogDuplicateScanScope.Source => "WHERE items.source_id = $source COLLATE NOCASE",
            _ => string.Empty
        };
        if (scope == CatalogDuplicateScanScope.Source)
        {
            command.Parameters.AddWithValue("$source", sourceId ?? string.Empty);
        }

        command.CommandText = $"""
            SELECT items.id, items.full_path, items.source_id, items.fingerprint, items.fingerprint_status,
                   items.is_favorite, items.is_blacklisted, items.play_count,
                   (SELECT COUNT(*) FROM item_tags WHERE item_tags.item_id = items.id)
            FROM items
            {where}
            ORDER BY items.position
            """;
        using var reader = command.ExecuteReader();
        var items = new List<CatalogDuplicateScanItem>();
        while (reader.Read())
        {
            var fingerprint = reader.IsDBNull(3) ? null : reader.GetString(3).Trim();
            items.Add(new CatalogDuplicateScanItem
            {
                Id = reader.GetString(0),
                FullPath = reader.GetString(1),
                SourceId = reader.GetString(2),
                Fingerprint = string.IsNullOrEmpty(fingerprint) ? null : fingerprint,
                FingerprintStatus = reader.IsDBNull(4) ? null : reader.GetInt32(4),
                IsFavorite = reader.GetInt32(5) != 0,
                IsBlacklisted = reader.GetInt32(6) != 0,
                PlayCount = reader.GetInt32(7),
                TagCount = Convert.ToInt32(reader.GetInt64(8), CultureInfo.InvariantCulture)
            });
        }

        return items;
    }

    /// <summary>The id and path of each named item, in catalog order. An id no item has is skipped.</summary>
    public IReadOnlyList<CatalogStoredItem> ReadItemsByIds(IReadOnlyList<string> ids)
    {
        var requested = DistinctIds(ids);
        if (requested.Count == 0)
        {
            return [];
        }

        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        var rows = ReadItemRows(connection, transaction: null, requested, "id, full_path, position", reader =>
            (Position: reader.GetInt32(2), Item: new CatalogStoredItem
            {
                Id = reader.GetString(0),
                FullPath = reader.GetString(1)
            }));
        return rows.Values
            .OrderBy(row => row.Position)
            .Select(row => row.Item)
            .ToList();
    }

    public IReadOnlyList<CatalogRefreshSource> ReadRefreshSources()
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, root_path, is_enabled FROM sources ORDER BY position;";
        using var reader = command.ExecuteReader();
        var sources = new List<CatalogRefreshSource>();
        while (reader.Read())
        {
            sources.Add(new CatalogRefreshSource
            {
                Id = reader.GetString(0),
                RootPath = reader.GetString(1),
                IsEnabled = reader.GetInt32(2) != 0
            });
        }

        return sources;
    }

    public IReadOnlyList<LibraryCatalogSource> ReadSources()
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, root_path, display_name, is_enabled FROM sources ORDER BY position;";
        using var reader = command.ExecuteReader();
        var sources = new List<LibraryCatalogSource>();
        while (reader.Read())
        {
            sources.Add(new LibraryCatalogSource
            {
                Id = reader.GetString(0),
                RootPath = reader.GetString(1),
                DisplayName = reader.IsDBNull(2) ? null : reader.GetString(2).Trim(),
                IsEnabled = reader.GetInt32(3) != 0
            });
        }

        return sources;
    }

    public IReadOnlyList<CatalogRefreshItem> ReadRefreshItems()
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, source_id, full_path, relative_path, file_name, media_type,
                   duration_ticks, has_audio, integrated_loudness, peak_db,
                   fingerprint, fingerprint_algorithm, fingerprint_version,
                   file_size_bytes, last_write_time_utc, fingerprint_last_utc,
                   fingerprint_status, loudness_error,
                   thumbnail_revision, thumbnail_width, thumbnail_height,
                   loudness_analysis_version
            FROM items
            ORDER BY position;
            """;
        using var reader = command.ExecuteReader();
        var items = new List<CatalogRefreshItem>();
        while (reader.Read())
        {
            var fingerprint = reader.IsDBNull(10) ? null : reader.GetString(10).Trim();
            items.Add(new CatalogRefreshItem
            {
                Id = reader.GetString(0),
                SourceId = reader.GetString(1),
                FullPath = reader.GetString(2),
                RelativePath = reader.GetString(3),
                FileName = reader.GetString(4),
                MediaType = reader.GetInt32(5),
                DurationTicks = reader.IsDBNull(6) ? null : reader.GetInt64(6),
                HasAudio = reader.IsDBNull(7) ? null : reader.GetInt32(7) != 0,
                IntegratedLoudness = reader.IsDBNull(8) ? null : reader.GetDouble(8),
                PeakDb = reader.IsDBNull(9) ? null : reader.GetDouble(9),
                Fingerprint = string.IsNullOrEmpty(fingerprint) ? null : fingerprint,
                FingerprintAlgorithm = reader.IsDBNull(11) ? string.Empty : reader.GetString(11),
                FingerprintVersion = reader.IsDBNull(12) ? 0 : reader.GetInt32(12),
                FileSizeBytes = reader.IsDBNull(13) ? null : reader.GetInt64(13),
                LastWriteTimeUtc = LibraryCatalogStore.ReadUtc(reader, 14),
                FingerprintLastUtc = LibraryCatalogStore.ReadUtc(reader, 15),
                FingerprintStatus = reader.IsDBNull(16) ? null : reader.GetInt32(16),
                LoudnessError = reader.IsDBNull(17) ? null : reader.GetString(17),
                ThumbnailRevision = reader.IsDBNull(18) ? null : reader.GetString(18),
                ThumbnailWidth = reader.IsDBNull(19) ? null : reader.GetInt32(19),
                ThumbnailHeight = reader.IsDBNull(20) ? null : reader.GetInt32(20),
                LoudnessAnalysisVersion = reader.GetInt32(21)
            });
        }

        return items;
    }

    public IReadOnlyList<LibraryCatalogPreset> ReadPresets()
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, name, filter_state FROM presets ORDER BY position;";
        using var reader = command.ExecuteReader();
        var presets = new List<LibraryCatalogPreset>();
        while (reader.Read())
        {
            presets.Add(new LibraryCatalogPreset
            {
                Id = reader.GetString(0),
                Name = reader.GetString(1),
                FilterStateJson = reader.GetString(2)
            });
        }

        return presets;
    }

    /// <summary>Adds a preset after every other one.</summary>
    public void CreatePreset(LibraryCatalogPreset preset)
    {
        ArgumentNullException.ThrowIfNull(preset);
        Commit((connection, transaction) =>
        {
            var position = LibraryCatalogStore.ExecuteScalarInt(
                connection,
                "SELECT COALESCE(MAX(position) + 1, 0) FROM presets;",
                transaction);
            InsertPreset(connection, transaction, position, preset);
            return true;
        });
    }

    /// <summary>Replaces the filter state of the preset with this id. False when there is none.</summary>
    public bool UpdatePresetFilter(string id, string filterStateJson)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE presets SET filter_state = $filter WHERE id = $id;",
                ("$id", id),
                ("$filter", StoredFilterState(filterStateJson))) > 0);
    }

    /// <summary>Renames the preset with this id. False when there is none.</summary>
    public bool RenamePreset(string id, string name)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE presets SET name = $name, name_fold = $fold WHERE id = $id;",
                ("$id", id),
                ("$name", name),
                ("$fold", LibraryCatalogStore.Fold(name))) > 0);
    }

    /// <summary>
    /// Puts the presets in the order of <paramref name="ids"/>, changing nothing else. False, changing nothing, unless
    /// it names every preset once.
    /// </summary>
    public bool ReorderPresets(IReadOnlyList<string> ids)
    {
        ArgumentNullException.ThrowIfNull(ids);
        return Commit((connection, transaction) =>
        {
            var stored = new List<string>();
            using (var read = connection.CreateCommand())
            {
                read.Transaction = transaction;
                read.CommandText = "SELECT id FROM presets;";
                using var reader = read.ExecuteReader();
                while (reader.Read())
                {
                    stored.Add(reader.GetString(0));
                }
            }

            if (ids.Count != stored.Count || !ids.ToHashSet(StringComparer.Ordinal).SetEquals(stored))
            {
                return false;
            }

            // Positions are the key, so every preset moves out of the way before each takes its new one.
            LibraryCatalogStore.Execute(connection, transaction, "UPDATE presets SET position = -1 - position;");
            for (var i = 0; i < ids.Count; i++)
            {
                LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "UPDATE presets SET position = $position WHERE id = $id;",
                    ("$position", i),
                    ("$id", ids[i]));
            }

            return true;
        });
    }

    /// <summary>Deletes the preset with this id. False when there is none.</summary>
    public bool DeletePreset(string id)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM presets WHERE id = $id;", ("$id", id)) > 0);
    }

    private static void InsertPreset(SqliteConnection connection, SqliteTransaction transaction, int position, LibraryCatalogPreset preset)
    {
        LibraryCatalogStore.Execute(
            connection,
            transaction,
            """
            INSERT INTO presets (position, name, name_fold, filter_state, id)
            VALUES ($position, $name, $fold, $filter, $id);
            """,
            ("$position", position),
            ("$name", preset.Name),
            ("$fold", LibraryCatalogStore.Fold(preset.Name)),
            ("$filter", StoredFilterState(preset.FilterStateJson)),
            ("$id", preset.Id));
    }

    private static string StoredFilterState(string filterStateJson)
    {
        return string.IsNullOrWhiteSpace(filterStateJson) ? "{}" : filterStateJson;
    }

    public bool SetThumbnail(string itemId, string? revision, int? width, int? height)
    {
        if (string.IsNullOrWhiteSpace(itemId))
        {
            return false;
        }

        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                UPDATE items
                SET thumbnail_revision = $revision,
                    thumbnail_width = $width,
                    thumbnail_height = $height
                WHERE id = $id;
                """,
                ("$id", itemId),
                ("$revision", (object?)revision ?? DBNull.Value),
                ("$width", width is > 0 ? width.Value : DBNull.Value),
                ("$height", height is > 0 ? height.Value : DBNull.Value)) > 0);
    }

    public static JsonObject ToItemJson(LibraryCatalogItem item) => ToItem(item);

    /// <summary>
    /// The items whose name sort key needs computing: every item when the key version stored in the
    /// catalog is not <see cref="LibraryCatalogNameSortKey.Version"/>, otherwise those without a key.
    /// </summary>
    public CatalogNameSortKeyWork ReadNameSortKeyWork()
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var transaction = connection.BeginTransaction(deferred: true);
        var stored = ScalarString(
            connection,
            transaction,
            "SELECT value FROM catalog_meta WHERE key = $key;",
            ("$key", LibraryCatalogStore.NameSortKeyVersionKey));
        var versionChanged = !string.Equals(
            stored,
            LibraryCatalogNameSortKey.Version.ToString(CultureInfo.InvariantCulture),
            StringComparison.Ordinal);
        using var command = connection.CreateCommand();
        command.CommandText = versionChanged
            ? "SELECT id, file_name FROM items ORDER BY position;"
            : "SELECT id, file_name FROM items WHERE file_name_sort_key IS NULL ORDER BY position;";
        var items = new List<CatalogNameSortKeyItem>();
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                items.Add(new CatalogNameSortKeyItem(reader.GetString(0), reader.GetString(1)));
            }
        }

        transaction.Commit();
        return new CatalogNameSortKeyWork { Items = items, VersionChanged = versionChanged };
    }

    /// <summary>
    /// Writes each item's name sort key, skipping an item renamed since it was read and a key that is
    /// already right. Returns how many keys changed.
    /// </summary>
    public int WriteNameSortKeys(IReadOnlyList<CatalogNameSortKeyItem> items)
    {
        ArgumentNullException.ThrowIfNull(items);
        var written = 0;
        Commit((connection, transaction) =>
        {
            written = 0;
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE items
                SET file_name_sort_key = $key
                WHERE id = $id
                  AND file_name = $name
                  AND (file_name_sort_key IS NULL OR file_name_sort_key != $key);
                """;
            var key = command.Parameters.Add("$key", SqliteType.Blob);
            var id = command.Parameters.Add("$id", SqliteType.Text);
            var name = command.Parameters.Add("$name", SqliteType.Text);
            foreach (var item in items)
            {
                key.Value = LibraryCatalogNameSortKey.Compute(item.FileName);
                id.Value = item.Id;
                name.Value = item.FileName;
                written += command.ExecuteNonQuery();
            }

            return written > 0;
        });
        return written;
    }

    /// <summary>Records that every stored name sort key is at <see cref="LibraryCatalogNameSortKey.Version"/>.</summary>
    public bool SetNameSortKeyVersion()
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                "INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ($key, $value);",
                ("$key", LibraryCatalogStore.NameSortKeyVersionKey),
                ("$value", LibraryCatalogNameSortKey.Version.ToString(CultureInfo.InvariantCulture))) > 0);
    }

    public void RunInTransaction(Action work)
    {
        ArgumentNullException.ThrowIfNull(work);
        if (_writeScope.Value != null)
        {
            work();
            return;
        }

        var committed = false;
        using (var connection = LibraryCatalogStore.OpenWrite(_databasePath))
        using (var transaction = connection.BeginTransaction())
        {
            var scope = new WriteScope(connection, transaction);
            _writeScope.Value = scope;
            try
            {
                work();
                if (!scope.Changed)
                {
                    transaction.Rollback();
                    return;
                }

                LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    """
                    UPDATE catalog_meta
                    SET value = CAST((CAST(value AS INTEGER) + 1) AS TEXT)
                    WHERE key = 'revision';
                    """);
                transaction.Commit();
                committed = true;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
            finally
            {
                _writeScope.Value = null;
            }
        }

        if (committed)
        {
            NotifySuccessfulWrite();
        }
    }

    public bool InsertSource(string id, string rootPath, string? displayName, bool isEnabled)
    {
        if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(rootPath))
        {
            return false;
        }

        return Commit((connection, transaction) =>
        {
            var position = NextPosition(connection, transaction, "sources");
            return LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                INSERT INTO sources (id, position, root_path, root_path_fold, display_name, is_enabled)
                VALUES ($id, $position, $root, $fold, $display, $enabled);
                """,
                ("$id", id),
                ("$position", position),
                ("$root", rootPath),
                ("$fold", LibraryCatalogStore.Fold(rootPath)),
                ("$display", (object?)displayName ?? DBNull.Value),
                ("$enabled", isEnabled ? 1 : 0)) > 0;
        });
    }

    public bool SetSourceDisplayName(string id, string? displayName)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE sources SET display_name = $display WHERE id = $id;",
                ("$id", id),
                ("$display", (object?)displayName ?? DBNull.Value)) > 0);
    }

    public bool SetSourceEnabled(string id, bool isEnabled)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE sources SET is_enabled = $enabled WHERE id = $id;",
                ("$id", id),
                ("$enabled", isEnabled ? 1 : 0)) > 0);
    }

    public bool InsertItem(LibraryCatalogItem item)
    {
        if (string.IsNullOrWhiteSpace(item.Id) || string.IsNullOrWhiteSpace(item.FullPath))
        {
            return false;
        }

        return Commit((connection, transaction) =>
        {
            var position = NextPosition(connection, transaction, "items");
            var inserted = LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                INSERT INTO items (
                    id, position, source_id, full_path, full_path_fold, relative_path, relative_path_fold,
                    file_name, file_name_fold, duration_ticks, has_audio, integrated_loudness, peak_db,
                    is_favorite, is_blacklisted, play_count, last_played_utc, media_type, fingerprint,
                    fingerprint_algorithm, fingerprint_version, file_size_bytes, last_write_time_utc,
                    fingerprint_last_utc, fingerprint_status, loudness_error,
                    thumbnail_revision, thumbnail_width, thumbnail_height, file_name_sort_key, rating, date_added_utc)
                VALUES (
                    $id, $position, $source, $full, $fullFold, $relative, $relativeFold,
                    $file, $fileFold, $duration, $audio, $loudness, $peak,
                    $favorite, $blacklisted, $plays, $played, $media, $fingerprint,
                    $algorithm, $fpVersion, $size, $write, $fpLast, $fpStatus, $loudnessError,
                    $thumbRevision, $thumbWidth, $thumbHeight, $fileKey, $rating, $added);
                """,
                ("$id", item.Id),
                ("$position", position),
                ("$source", item.SourceId),
                ("$full", item.FullPath),
                ("$fullFold", LibraryCatalogStore.Fold(item.FullPath)),
                ("$relative", item.RelativePath),
                ("$relativeFold", LibraryCatalogStore.Fold(item.RelativePath)),
                ("$file", item.FileName),
                ("$fileFold", LibraryCatalogStore.Fold(item.FileName)),
                ("$duration", (object?)item.DurationTicks ?? DBNull.Value),
                ("$audio", item.HasAudio switch { true => 1, false => 0, _ => DBNull.Value }),
                ("$loudness", (object?)item.IntegratedLoudness ?? DBNull.Value),
                ("$peak", (object?)item.PeakDb ?? DBNull.Value),
                ("$favorite", item.IsFavorite ? 1 : 0),
                ("$blacklisted", item.IsBlacklisted ? 1 : 0),
                ("$plays", item.PlayCount),
                ("$played", item.LastPlayedUtc is null ? DBNull.Value : item.LastPlayedUtc.Value.ToUniversalTime().Ticks),
                ("$media", item.MediaType),
                ("$fingerprint", (object?)item.Fingerprint ?? DBNull.Value),
                ("$algorithm", string.IsNullOrWhiteSpace(item.FingerprintAlgorithm) ? "SHA-256" : item.FingerprintAlgorithm),
                ("$fpVersion", item.FingerprintVersion <= 0 ? 1 : item.FingerprintVersion),
                ("$size", (object?)item.FileSizeBytes ?? DBNull.Value),
                ("$write", item.LastWriteTimeUtc is null ? DBNull.Value : item.LastWriteTimeUtc.Value.ToUniversalTime().Ticks),
                ("$fpLast", item.FingerprintLastUtc is null ? DBNull.Value : item.FingerprintLastUtc.Value.ToUniversalTime().Ticks),
                ("$fpStatus", (object?)item.FingerprintStatus ?? DBNull.Value),
                ("$loudnessError", (object?)item.LoudnessError ?? DBNull.Value),
                ("$thumbRevision", (object?)item.ThumbnailRevision ?? DBNull.Value),
                ("$thumbWidth", (object?)item.ThumbnailWidth ?? DBNull.Value),
                ("$thumbHeight", (object?)item.ThumbnailHeight ?? DBNull.Value),
                ("$fileKey", LibraryCatalogNameSortKey.Compute(item.FileName)),
                ("$rating", (object?)item.RatingHalfStars ?? DBNull.Value),
                ("$added", item.DateAddedUtc is null ? DBNull.Value : item.DateAddedUtc.Value.ToUniversalTime().Ticks)) > 0;
            if (!inserted)
            {
                return false;
            }

            WriteItemTags(connection, transaction, item.Id, item.Tags);
            return true;
        });
    }

    public bool UpdateItemIdentity(string id, string sourceId, string fullPath, string relativePath, string fileName, int mediaType)
    {
        if (string.IsNullOrWhiteSpace(fullPath))
        {
            return false;
        }

        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                UPDATE items
                SET source_id = $source, full_path = $full, full_path_fold = $fullFold,
                    relative_path = $relative, relative_path_fold = $relativeFold,
                    file_name = $file, file_name_fold = $fileFold, file_name_sort_key = $fileKey, media_type = $media
                WHERE id = $id;
                """,
                ("$id", id),
                ("$source", sourceId),
                ("$full", fullPath),
                ("$fullFold", LibraryCatalogStore.Fold(fullPath)),
                ("$relative", relativePath),
                ("$relativeFold", LibraryCatalogStore.Fold(relativePath)),
                ("$file", fileName),
                ("$fileFold", LibraryCatalogStore.Fold(fileName)),
                ("$fileKey", LibraryCatalogNameSortKey.Compute(fileName)),
                ("$media", mediaType)) > 0);
    }

    public CatalogSourceImportResult ImportSourceFolder(string rootPath, string? displayName, IReadOnlyList<CatalogSourceImportFile> files)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rootPath);
        ArgumentNullException.ThrowIfNull(files);

        var sourceId = string.Empty;
        var imported = 0;
        var updated = 0;
        RunInTransaction(() =>
        {
            var source = FindSourceByRootPath(rootPath);
            if (source == null)
            {
                sourceId = Guid.NewGuid().ToString();
                if (!InsertSource(sourceId, rootPath, LibrarySourcePath.ResolveDisplayName(displayName, rootPath), true))
                {
                    throw new InvalidOperationException("Catalog import failed to insert a source.");
                }
            }
            else
            {
                sourceId = source.Id;
                var requestedName = string.IsNullOrWhiteSpace(displayName) ? null : displayName.Trim();
                if (requestedName != null && !string.Equals(requestedName, source.DisplayName, StringComparison.Ordinal))
                {
                    SetSourceDisplayName(sourceId, requestedName);
                }
            }

            foreach (var file in files)
            {
                if (string.IsNullOrWhiteSpace(file.FullPath))
                {
                    continue;
                }

                var existing = ReadItemIdentityByPath(file.FullPath);
                if (existing == null)
                {
                    var fileName = string.IsNullOrWhiteSpace(file.FileName) ? Path.GetFileName(file.FullPath) : file.FileName;
                    if (!InsertItem(new LibraryCatalogItem
                    {
                        Id = Guid.NewGuid().ToString(),
                        SourceId = sourceId,
                        FullPath = file.FullPath,
                        RelativePath = file.RelativePath,
                        FileName = fileName,
                        MediaType = file.MediaType,
                        FingerprintAlgorithm = "SHA-256",
                        FingerprintVersion = 1,
                        FingerprintStatus = 0
                    }))
                    {
                        throw new InvalidOperationException("Catalog import failed to insert an item.");
                    }

                    imported++;
                    continue;
                }

                updated++;
                var nextFileName = string.IsNullOrWhiteSpace(file.FileName) ? Path.GetFileName(file.FullPath) : file.FileName;
                if (!SourceImportIdentityDiffers(existing.Value, sourceId, file.RelativePath, nextFileName, file.MediaType))
                {
                    continue;
                }

                if (!UpdateItemIdentity(existing.Value.Id, sourceId, existing.Value.FullPath, file.RelativePath, nextFileName, file.MediaType))
                {
                    throw new InvalidOperationException("Catalog import failed to update an item.");
                }
            }
        });

        return new CatalogSourceImportResult
        {
            SourceId = sourceId,
            ImportedCount = imported,
            UpdatedCount = updated
        };
    }

    public bool DeleteItem(string id)
    {
        return DeleteItems([id]).Count > 0;
    }

    /// <summary>
    /// Removes the named items, with their tags, in one write, and returns the ids of the items it removed. An id no
    /// item has is skipped.
    /// </summary>
    public IReadOnlyList<string> DeleteItems(IReadOnlyList<string> ids)
    {
        var requested = DistinctIds(ids);
        if (requested.Count == 0)
        {
            return [];
        }

        var removed = new List<string>();
        Commit((connection, transaction) =>
        {
            removed.Clear();
            var found = ReadItemRows(connection, transaction, requested, "id", reader => reader.GetString(0));
            removed.AddRange(requested.Where(found.ContainsKey));
            if (removed.Count == 0)
            {
                return false;
            }

            ForEachIdChunk(connection, transaction, removed, "DELETE FROM item_tags WHERE item_id IN ({0});", command => command.ExecuteNonQuery());
            ForEachIdChunk(connection, transaction, removed, "DELETE FROM items WHERE id IN ({0});", command => command.ExecuteNonQuery());
            return true;
        });
        return removed;
    }

    /// <summary>
    /// Sets or clears <paramref name="flag"/> on every named item in one write. Setting favorite clears blacklist, and
    /// setting blacklist clears favorite. Returns each named item in the library, in request order, with its favorite
    /// and blacklist before and after. An id no item has is skipped.
    /// </summary>
    public IReadOnlyList<CatalogItemFlagChange> SetItemsFlag(IReadOnlyList<string> identifiers, CatalogItemFlag flag, bool value)
    {
        var ids = DistinctIds(identifiers);
        if (ids.Count == 0)
        {
            return [];
        }

        var changes = new List<CatalogItemFlagChange>();
        Commit((connection, transaction) =>
        {
            changes.Clear();
            var rows = ReadItemRows(connection, transaction, ids, "id, full_path, is_favorite, is_blacklisted", reader =>
                (FullPath: reader.GetString(1), IsFavorite: reader.GetInt32(2) != 0, IsBlacklisted: reader.GetInt32(3) != 0));
            using var update = connection.CreateCommand();
            update.Transaction = transaction;
            update.CommandText = "UPDATE items SET is_favorite = $favorite, is_blacklisted = $blacklisted WHERE id = $id;";
            var idParameter = update.Parameters.Add("$id", SqliteType.Text);
            var favoriteParameter = update.Parameters.Add("$favorite", SqliteType.Integer);
            var blacklistedParameter = update.Parameters.Add("$blacklisted", SqliteType.Integer);
            var changed = false;
            foreach (var id in ids)
            {
                if (!rows.TryGetValue(id, out var before))
                {
                    continue;
                }

                var isFavorite = flag == CatalogItemFlag.Favorite ? value : before.IsFavorite && !value;
                var isBlacklisted = flag == CatalogItemFlag.Blacklist ? value : before.IsBlacklisted && !value;
                var change = new CatalogItemFlagChange
                {
                    Id = id,
                    FullPath = before.FullPath,
                    IsFavorite = isFavorite,
                    IsBlacklisted = isBlacklisted,
                    PreviousIsFavorite = before.IsFavorite,
                    PreviousIsBlacklisted = before.IsBlacklisted
                };
                changes.Add(change);
                if (!change.Changed)
                {
                    continue;
                }

                idParameter.Value = id;
                favoriteParameter.Value = isFavorite ? 1 : 0;
                blacklistedParameter.Value = isBlacklisted ? 1 : 0;
                changed |= update.ExecuteNonQuery() > 0;
            }

            return changed;
        });
        return changes;
    }

    /// <summary>
    /// Sets one rating in half stars on every named item in one write, or clears it with null. A rating is independent
    /// of favorite and blacklist, so neither changes. Returns each named item in the library, in request order, with
    /// its rating before and after. An id no item has is skipped.
    /// </summary>
    public IReadOnlyList<CatalogItemRatingChange> SetItemsRating(IReadOnlyList<string> identifiers, int? halfStars)
    {
        if (halfStars is int stored && !ItemRating.IsStoredValue(stored))
        {
            throw new ArgumentOutOfRangeException(nameof(halfStars), halfStars, "A rating is 1 to 10 half stars, or null for none.");
        }

        var ids = DistinctIds(identifiers);
        if (ids.Count == 0)
        {
            return [];
        }

        var changes = new List<CatalogItemRatingChange>();
        Commit((connection, transaction) =>
        {
            changes.Clear();
            var rows = ReadItemRows(connection, transaction, ids, "id, full_path, rating", reader =>
                (FullPath: reader.GetString(1), RatingHalfStars: reader.IsDBNull(2) ? (int?)null : reader.GetInt32(2)));
            using var update = connection.CreateCommand();
            update.Transaction = transaction;
            update.CommandText = "UPDATE items SET rating = $rating WHERE id = $id;";
            var idParameter = update.Parameters.Add("$id", SqliteType.Text);
            update.Parameters.AddWithValue("$rating", (object?)halfStars ?? DBNull.Value);
            var changed = false;
            foreach (var id in ids)
            {
                if (!rows.TryGetValue(id, out var before))
                {
                    continue;
                }

                var change = new CatalogItemRatingChange
                {
                    Id = id,
                    FullPath = before.FullPath,
                    RatingHalfStars = halfStars,
                    PreviousRatingHalfStars = before.RatingHalfStars
                };
                changes.Add(change);
                if (!change.Changed)
                {
                    continue;
                }

                idParameter.Value = id;
                changed |= update.ExecuteNonQuery() > 0;
            }

            return changed;
        });
        return changes;
    }

    public CatalogItemState? RecordPlayback(string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return null;
        }

        CatalogItemState? recorded = null;
        var committed = Commit((connection, transaction) =>
        {
            var current = ReadItemState(connection, transaction, identifier);
            if (current == null)
            {
                return false;
            }

            var id = current.Id;
            var nextPlayCount = current.PlayCount;
            if (nextPlayCount < int.MaxValue)
            {
                nextPlayCount++;
            }

            var previousLastPlayedUtc = current.LastPlayedUtc;
            var nowUtc = DateTime.UtcNow;
            var updated = LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE items SET play_count = $plays, last_played_utc = $played WHERE id = $id;",
                ("$id", id),
                ("$plays", nextPlayCount),
                ("$played", nowUtc.Ticks)) > 0;
            if (!updated)
            {
                return false;
            }

            recorded = new CatalogItemState
            {
                Id = current.Id,
                FullPath = current.FullPath,
                IsFavorite = current.IsFavorite,
                IsBlacklisted = current.IsBlacklisted,
                PlayCount = nextPlayCount,
                LastPlayedUtc = nowUtc,
                PreviousLastPlayedUtc = previousLastPlayedUtc,
                RatingHalfStars = current.RatingHalfStars
            };
            return true;
        });
        return committed ? recorded : null;
    }

    /// <summary>
    /// Clears the playback stats of the named items only, and answers how many of them are in the library and how many
    /// had stats to clear. No ids clears nothing.
    /// </summary>
    public CatalogPlaybackStatsClear ClearPlaybackStats(IReadOnlyCollection<string> itemIds)
    {
        var requested = DistinctIds(itemIds);
        if (requested.Count == 0)
        {
            return default;
        }

        var count = 0;
        var cleared = 0;
        Commit((connection, transaction) =>
        {
            count = CountItems(connection, transaction, requested);
            cleared = 0;
            ForEachIdChunk(
                connection,
                transaction,
                requested,
                "UPDATE items SET play_count = 0, last_played_utc = NULL WHERE id IN ({0}) AND (play_count != 0 OR last_played_utc IS NOT NULL);",
                command => cleared += command.ExecuteNonQuery());
            return cleared > 0;
        });
        return new CatalogPlaybackStatsClear(count, cleared);
    }

    /// <summary>Clears every item's playback stats, and answers how many items there are and how many had stats to clear.</summary>
    public CatalogPlaybackStatsClear ClearAllPlaybackStats()
    {
        var count = 0;
        var cleared = 0;
        Commit((connection, transaction) =>
        {
            count = LibraryCatalogStore.ExecuteScalarInt(connection, "SELECT COUNT(*) FROM items;", transaction);
            cleared = LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE items SET play_count = 0, last_played_utc = NULL WHERE play_count != 0 OR last_played_utc IS NOT NULL;");
            return cleared > 0;
        });
        return new CatalogPlaybackStatsClear(count, cleared);
    }

    public CatalogItemState? ReadItemState(string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return null;
        }

        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        return ReadItemState(connection, transaction: null, identifier);
    }

    /// <summary>The item with exactly this catalog id, trimmed, and whether its source is enabled, for playing it.</summary>
    public CatalogPlaybackItem? ReadPlaybackItem(string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return null;
        }

        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        return ReadPlaybackRow(connection, transaction: null, identifier.Trim());
    }

    private static CatalogPlaybackItem? ReadPlaybackRow(SqliteConnection connection, SqliteTransaction? transaction, string id)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT items.id, items.full_path, items.file_name, items.media_type, items.duration_ticks,
                   items.is_favorite, items.is_blacklisted, sources.is_enabled,
                   items.integrated_loudness, items.peak_db, items.rating
            FROM items
            LEFT JOIN sources ON sources.id = items.source_id
            WHERE items.id = $id
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        return new CatalogPlaybackItem
        {
            Id = reader.GetString(0),
            FullPath = reader.GetString(1),
            FileName = reader.GetString(2),
            MediaType = reader.GetInt32(3),
            DurationTicks = reader.IsDBNull(4) ? null : reader.GetInt64(4),
            IsFavorite = reader.GetInt32(5) != 0,
            IsBlacklisted = reader.GetInt32(6) != 0,
            IsSourceEnabled = reader.IsDBNull(7) || reader.GetInt32(7) != 0,
            IntegratedLoudness = reader.IsDBNull(8) ? null : reader.GetDouble(8),
            PeakDb = reader.IsDBNull(9) ? null : reader.GetDouble(9),
            RatingHalfStars = reader.IsDBNull(10) ? null : reader.GetInt32(10)
        };
    }

    public bool SetFingerprint(string id, string? fingerprint, string algorithm, int version, int? status, DateTime? fingerprintLastUtc)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                UPDATE items
                SET fingerprint = $fingerprint, fingerprint_algorithm = $algorithm, fingerprint_version = $version,
                    fingerprint_status = $status, fingerprint_last_utc = $last
                WHERE id = $id;
                """,
                ("$id", id),
                ("$fingerprint", (object?)fingerprint ?? DBNull.Value),
                ("$algorithm", string.IsNullOrWhiteSpace(algorithm) ? "SHA-256" : algorithm),
                ("$version", version),
                ("$status", (object?)status ?? DBNull.Value),
                ("$last", fingerprintLastUtc is null ? DBNull.Value : fingerprintLastUtc.Value.ToUniversalTime().Ticks)) > 0);
    }

    public bool SetDuration(string id, long? durationTicks)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE items SET duration_ticks = $duration WHERE id = $id;",
                ("$id", id),
                ("$duration", (object?)durationTicks ?? DBNull.Value)) > 0);
    }

    public bool SetLoudness(
        string id,
        bool? hasAudio,
        double? integratedLoudness,
        double? peakDb,
        string? loudnessError,
        int loudnessAnalysisVersion)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                UPDATE items
                SET has_audio = $audio, integrated_loudness = $loudness, peak_db = $peak, loudness_error = $error,
                    loudness_analysis_version = $analysisVersion
                WHERE id = $id;
                """,
                ("$id", id),
                ("$audio", hasAudio switch { true => 1, false => 0, _ => DBNull.Value }),
                ("$loudness", (object?)integratedLoudness ?? DBNull.Value),
                ("$peak", (object?)peakDb ?? DBNull.Value),
                ("$error", (object?)loudnessError ?? DBNull.Value),
                ("$analysisVersion", loudnessAnalysisVersion)) > 0);
    }

    public bool SetFileSize(string id, long? fileSizeBytes)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE items SET file_size_bytes = $size WHERE id = $id;",
                ("$id", id),
                ("$size", (object?)fileSizeBytes ?? DBNull.Value)) > 0);
    }

    public bool SetLastWriteTime(string id, DateTime? lastWriteTimeUtc)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE items SET last_write_time_utc = $write WHERE id = $id;",
                ("$id", id),
                ("$write", lastWriteTimeUtc is null ? DBNull.Value : lastWriteTimeUtc.Value.ToUniversalTime().Ticks)) > 0);
    }

    public bool UpsertCategory(string? id, string name, int? sortOrder)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var categoryId = LibraryCatalogStore.NormalizeCategoryId(id);
        return Commit((connection, transaction) =>
        {
            if (string.Equals(categoryId, LibraryCatalogStore.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase))
            {
                return EnsureUncategorized(connection, transaction);
            }

            var existing = ScalarString(connection, transaction, "SELECT id FROM categories WHERE id = $id COLLATE NOCASE;", ("$id", categoryId));
            if (existing == null)
            {
                var position = NextPosition(connection, transaction, "categories");
                return LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "INSERT INTO categories (id, position, name, sort_order) VALUES ($id, $position, $name, $sort);",
                    ("$id", categoryId),
                    ("$position", position),
                    ("$name", name.Trim()),
                    ("$sort", sortOrder ?? position)) > 0;
            }

            if (sortOrder.HasValue)
            {
                return LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "UPDATE categories SET name = $name, sort_order = $sort WHERE id = $id;",
                    ("$id", existing),
                    ("$name", name.Trim()),
                    ("$sort", sortOrder.Value)) > 0;
            }

            return LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE categories SET name = $name WHERE id = $id;",
                ("$id", existing),
                ("$name", name.Trim())) > 0;
        });
    }

    public bool UpsertTag(string name, string? categoryId)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var trimmed = name.Trim();
        var fold = LibraryCatalogStore.Fold(trimmed);
        var categorySpecified = !string.IsNullOrWhiteSpace(categoryId);
        var category = LibraryCatalogStore.NormalizeCategoryId(categoryId);
        return Commit((connection, transaction) =>
        {
            EnsureUncategorized(connection, transaction);
            var position = ScalarInt(connection, transaction, "SELECT position FROM tags WHERE name_fold = $fold;", ("$fold", fold));
            if (position == null)
            {
                var next = NextPosition(connection, transaction, "tags");
                return LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "INSERT INTO tags (position, name, name_fold, category_id) VALUES ($position, $name, $fold, $category);",
                    ("$position", next),
                    ("$name", trimmed),
                    ("$fold", fold),
                    ("$category", category)) > 0;
            }

            if (!categorySpecified)
            {
                return false;
            }

            var existingCategory = ScalarString(
                connection,
                transaction,
                "SELECT category_id FROM tags WHERE position = $position;",
                ("$position", position.Value));
            if (string.Equals(existingCategory, category, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            return LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE tags SET category_id = $category WHERE position = $position;",
                ("$position", position.Value),
                ("$category", category)) > 0;
        });
    }

    public bool RenameTag(string oldName, string newName, string? newCategoryId)
    {
        return RenameTag(oldName, newName, newCategoryId, out _);
    }

    public bool RenameTag(string oldName, string newName, string? newCategoryId, out List<string> changedItemIds)
    {
        changedItemIds = [];
        if (string.IsNullOrWhiteSpace(oldName) || string.IsNullOrWhiteSpace(newName))
        {
            return false;
        }

        var trimmed = newName.Trim();
        var oldFold = LibraryCatalogStore.Fold(oldName.Trim());
        var newFold = LibraryCatalogStore.Fold(trimmed);
        var affected = new List<string>();
        var changed = Commit((connection, transaction) =>
        {
            var sourceRows = ReadTagsByFold(connection, transaction, oldFold);
            if (sourceRows.Count == 0)
            {
                return false;
            }

            affected.AddRange(ReadItemIdsForTagFold(connection, transaction, oldFold));

            var source = sourceRows[0];
            var sourceCategory = newCategoryId != null
                ? LibraryCatalogStore.NormalizeCategoryId(newCategoryId)
                : source.CategoryId;
            var collapsing = new List<CatalogTag> { new(source.Position, sourceCategory) };
            foreach (var row in ReadTagsByFold(connection, transaction, newFold))
            {
                if (row.Position == source.Position)
                {
                    continue;
                }

                collapsing.Add(row);
            }

            collapsing.Sort(static (left, right) => left.Position.CompareTo(right.Position));
            var winnerCategory = WinningCategory(collapsing);
            var changed = LibraryCatalogStore.Execute(
                connection,
                transaction,
                "DELETE FROM tags WHERE name_fold = $fold AND position != $position;",
                ("$fold", newFold),
                ("$position", source.Position)) > 0;
            changed |= LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE tags SET name = $name, name_fold = $fold, category_id = $category WHERE position = $position;",
                ("$position", source.Position),
                ("$name", trimmed),
                ("$fold", newFold),
                ("$category", winnerCategory)) > 0;

            changed |= LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE item_tags SET name = $name, name_fold = $fold WHERE name_fold = $old;",
                ("$name", trimmed),
                ("$fold", newFold),
                ("$old", oldFold)) > 0;
            changed |= LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                DELETE FROM item_tags
                WHERE name_fold = $fold
                  AND position > (
                    SELECT MIN(keep.position)
                    FROM item_tags AS keep
                    WHERE keep.item_id = item_tags.item_id AND keep.name_fold = item_tags.name_fold);
                """,
                ("$fold", newFold)) > 0;
            return changed;
        });
        if (changed)
        {
            changedItemIds = affected;
        }

        return changed;
    }

    public bool DeleteTag(string name)
    {
        return DeleteTag(name, out _);
    }

    public bool DeleteTag(string name, out List<string> changedItemIds)
    {
        changedItemIds = [];
        if (string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var fold = LibraryCatalogStore.Fold(name.Trim());
        var affected = new List<string>();
        var removed = Commit((connection, transaction) =>
        {
            affected.AddRange(ReadItemIdsForTagFold(connection, transaction, fold));
            var deleted = LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM tags WHERE name_fold = $fold;", ("$fold", fold)) > 0;
            deleted |= LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM item_tags WHERE name_fold = $fold;", ("$fold", fold)) > 0;
            return deleted;
        });
        if (removed)
        {
            changedItemIds = affected;
        }

        return removed;
    }

    public bool DeleteCategory(string categoryId, string? newCategoryId)
    {
        if (string.IsNullOrWhiteSpace(categoryId))
        {
            return false;
        }

        var sourceId = LibraryCatalogStore.NormalizeCategoryId(categoryId);
        if (string.Equals(sourceId, LibraryCatalogStore.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var targetId = newCategoryId == null
            ? LibraryCatalogStore.UncategorizedCategoryId
            : LibraryCatalogStore.NormalizeCategoryId(newCategoryId);
        return Commit((connection, transaction) =>
        {
            var changed = LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM categories WHERE id = $id COLLATE NOCASE;", ("$id", sourceId)) > 0;
            changed |= LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE tags SET category_id = $target WHERE category_id = $source COLLATE NOCASE;",
                ("$target", targetId),
                ("$source", sourceId)) > 0;
            return changed;
        });
    }

    /// <summary>
    /// The tag catalog and the tags of each named item, or with <paramref name="countsOnly"/>, in place of each item's
    /// tags, how many of the named items hold each tag and how many of them are in the library.
    /// </summary>
    public CatalogTagEditorRead ReadTagEditor(IReadOnlyList<string>? identifiers, bool countsOnly = false)
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var transaction = connection.BeginTransaction();
        var categories = new List<LibraryCatalogCategory>();
        using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = "SELECT id, name, sort_order FROM categories;";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                categories.Add(new LibraryCatalogCategory
                {
                    Id = reader.GetString(0),
                    Name = reader.GetString(1),
                    SortOrder = reader.GetInt32(2)
                });
            }
        }

        var tags = new List<LibraryCatalogTag>();
        using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = "SELECT name, name_fold, category_id FROM tags;";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                tags.Add(new LibraryCatalogTag
                {
                    Name = reader.GetString(0),
                    NameFold = reader.GetString(1),
                    CategoryId = reader.GetString(2)
                });
            }
        }

        var requested = DistinctIds(identifiers);
        var items = new List<CatalogItemTagRead>();
        List<CatalogTagItemCount>? tagCounts = null;
        int? itemCount = null;
        if (countsOnly)
        {
            (tagCounts, itemCount) = ReadTagItemCounts(connection, transaction, requested);
        }
        else
        {
            foreach (var id in requested)
            {
                items.Add(new CatalogItemTagRead
                {
                    ItemId = id,
                    Tags = ResolveItemId(connection, transaction, id) == null ? [] : ReadItemTagNames(connection, transaction, id)
                });
            }
        }

        transaction.Rollback();
        return new CatalogTagEditorRead
        {
            Categories = categories,
            Tags = tags,
            Items = items,
            TagCounts = tagCounts,
            ItemCount = itemCount
        };
    }

    /// <summary>
    /// Each tag the named items hold, compared ignoring case, with how many of them hold it and the name one of them
    /// holds it by, and how many of the named items are in the library.
    /// </summary>
    private static (List<CatalogTagItemCount> TagCounts, int ItemCount) ReadTagItemCounts(
        SqliteConnection connection,
        SqliteTransaction transaction,
        IReadOnlyList<string> ids)
    {
        var itemCount = CountItems(connection, transaction, ids);

        // Ids are distinct, so each chunk counts its own items and the chunks' counts add up.
        var byFold = new Dictionary<string, (string Name, int Count)>(StringComparer.Ordinal);
        ForEachIdChunk(
            connection,
            transaction,
            ids,
            """
            SELECT name_fold, MIN(name), COUNT(DISTINCT item_tags.item_id)
            FROM item_tags
            WHERE item_id IN ({0})
            GROUP BY name_fold;
            """,
            command =>
            {
                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    var fold = reader.GetString(0);
                    var name = reader.GetString(1);
                    var count = reader.GetInt32(2);
                    byFold[fold] = byFold.TryGetValue(fold, out var existing)
                        ? (string.CompareOrdinal(existing.Name, name) <= 0 ? existing.Name : name, existing.Count + count)
                        : (name, count);
                }
            });
        return (byFold.Values.Select(entry => new CatalogTagItemCount(entry.Name, entry.Count)).ToList(), itemCount);
    }

    public bool ApplyItemTagEdits(
        IReadOnlyList<string> identifiers,
        IReadOnlyList<string> addTags,
        IReadOnlyList<string> removeTags,
        out bool catalogChanged)
    {
        return ApplyItemTagEdits(identifiers, addTags, removeTags, out catalogChanged, out _);
    }

    /// <summary>
    /// <paramref name="resolvedItemIds"/> is the catalog id of each named item that is in the catalog, in request order,
    /// also when nothing changed, so a caller can tell items that already had the tags from items no longer there.
    /// </summary>
    public bool ApplyItemTagEdits(
        IReadOnlyList<string> identifiers,
        IReadOnlyList<string> addTags,
        IReadOnlyList<string> removeTags,
        out bool catalogChanged,
        out List<string> resolvedItemIds)
    {
        catalogChanged = false;
        resolvedItemIds = [];
        var ids = DistinctIds(identifiers);
        var adds = DistinctTagNames(addTags);
        var removes = DistinctTagNames(removeTags);
        if (ids.Count == 0)
        {
            return false;
        }

        var insertedCatalog = false;
        var resolved = new List<string>();
        var committed = Commit((connection, transaction) =>
        {
            var changed = false;
            foreach (var add in adds)
            {
                if (InsertCatalogTagIfMissing(connection, transaction, add))
                {
                    insertedCatalog = true;
                    changed = true;
                }
            }

            foreach (var itemId in ids)
            {
                if (ResolveItemId(connection, transaction, itemId) == null)
                {
                    continue;
                }

                resolved.Add(itemId);
                foreach (var remove in removes)
                {
                    changed |= LibraryCatalogStore.Execute(
                        connection,
                        transaction,
                        "DELETE FROM item_tags WHERE item_id = $item AND name_fold = $fold;",
                        ("$item", itemId),
                        ("$fold", LibraryCatalogStore.Fold(remove))) > 0;
                }

                foreach (var add in adds)
                {
                    changed |= InsertItemTagIfMissing(connection, transaction, itemId, add);
                }
            }

            return changed;
        });
        catalogChanged = committed && insertedCatalog;
        resolvedItemIds = resolved;
        return committed;
    }

    public CatalogAutoTagApplyResult ApplyAutoTagAssignments(IReadOnlyList<CatalogAutoTagAssignment> assignments)
    {
        var applied = new List<CatalogAutoTagAppliedAssignment>();
        var committed = Commit((connection, transaction) =>
        {
            var changed = false;
            foreach (var assignment in assignments)
            {
                if (string.IsNullOrWhiteSpace(assignment.TagName))
                {
                    continue;
                }

                var tagName = assignment.TagName.Trim();
                changed |= InsertCatalogTagIfMissing(connection, transaction, tagName);
                var changedIds = new List<string>();
                var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var itemPath in assignment.ItemPaths)
                {
                    if (string.IsNullOrWhiteSpace(itemPath) || !seenPaths.Add(itemPath.Trim()))
                    {
                        continue;
                    }

                    var itemId = ResolveItemByPath(connection, transaction, itemPath);
                    if (itemId == null)
                    {
                        continue;
                    }

                    if (!InsertItemTagIfMissing(connection, transaction, itemId, tagName))
                    {
                        continue;
                    }

                    changed = true;
                    changedIds.Add(itemId);
                }

                if (changedIds.Count > 0)
                {
                    applied.Add(new CatalogAutoTagAppliedAssignment
                    {
                        TagName = tagName,
                        ChangedItemIds = changedIds
                    });
                }
            }

            return changed;
        });
        if (!committed)
        {
            return new CatalogAutoTagApplyResult();
        }

        return new CatalogAutoTagApplyResult
        {
            Applied = applied
        };
    }

    private static bool InsertItemTagIfMissing(SqliteConnection connection, SqliteTransaction transaction, string itemId, string name)
    {
        var fold = LibraryCatalogStore.Fold(name);
        var existing = ScalarInt(
            connection,
            transaction,
            "SELECT position FROM item_tags WHERE item_id = $item AND name_fold = $fold;",
            ("$item", itemId),
            ("$fold", fold));
        if (existing != null)
        {
            return false;
        }

        var position = NextItemTagPosition(connection, transaction, itemId);
        return LibraryCatalogStore.Execute(
            connection,
            transaction,
            "INSERT INTO item_tags (item_id, position, name, name_fold) VALUES ($item, $position, $name, $fold);",
            ("$item", itemId),
            ("$position", position),
            ("$name", name),
            ("$fold", fold)) > 0;
    }

    private LibraryCatalogSource? FindSourceByRootPath(string rootPath)
    {
        var scope = _writeScope.Value ?? throw new InvalidOperationException("Source lookup requires a catalog transaction.");
        using var command = scope.Connection.CreateCommand();
        command.Transaction = scope.Transaction;
        command.CommandText = "SELECT id, root_path, root_path_fold, display_name, is_enabled FROM sources ORDER BY position;";
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var source = new LibraryCatalogSource
            {
                Id = reader.GetString(0),
                RootPath = reader.GetString(1),
                RootPathFold = reader.GetString(2),
                DisplayName = reader.IsDBNull(3) ? null : reader.GetString(3),
                IsEnabled = reader.GetInt32(4) != 0
            };
            if (LibrarySourcePath.RootPathsEqual(source.RootPath, rootPath))
            {
                return source;
            }
        }

        return null;
    }

    private SourceImportIdentity? ReadItemIdentityByPath(string fullPath)
    {
        var scope = _writeScope.Value ?? throw new InvalidOperationException("Item lookup requires a catalog transaction.");
        using var command = scope.Connection.CreateCommand();
        command.Transaction = scope.Transaction;
        command.CommandText = """
            SELECT id, source_id, full_path, relative_path, file_name, media_type
            FROM items
            WHERE full_path_fold = $fold
            ORDER BY position
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$fold", LibraryCatalogStore.Fold(fullPath.Trim()));
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        return new SourceImportIdentity(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.GetInt32(5));
    }

    private static bool SourceImportIdentityDiffers(SourceImportIdentity existing, string sourceId, string relativePath, string fileName, int mediaType)
    {
        return !string.Equals(existing.SourceId, sourceId, StringComparison.OrdinalIgnoreCase) ||
               !string.Equals(existing.RelativePath, relativePath, StringComparison.Ordinal) ||
               !string.Equals(existing.FileName, fileName, StringComparison.Ordinal) ||
               existing.MediaType != mediaType;
    }

    private readonly record struct SourceImportIdentity(
        string Id,
        string SourceId,
        string FullPath,
        string RelativePath,
        string FileName,
        int MediaType);

    /// <summary>
    /// The item with exactly this catalog id, which the server generates and clients send back as they got it, so the
    /// lookup reads the id's primary key index. Another casing or a full path names no item.
    /// </summary>
    private static string? ResolveItemId(SqliteConnection connection, SqliteTransaction transaction, string identifier)
    {
        return ScalarString(
            connection,
            transaction,
            "SELECT id FROM items WHERE id = $id LIMIT 1;",
            ("$id", identifier.Trim()));
    }

    /// <summary>The named ids, trimmed, without blank ones, and each once, in request order.</summary>
    private static List<string> DistinctIds(IEnumerable<string>? identifiers)
    {
        var ids = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var identifier in identifiers ?? [])
        {
            if (string.IsNullOrWhiteSpace(identifier))
            {
                continue;
            }

            var id = identifier.Trim();
            if (seen.Add(id))
            {
                ids.Add(id);
            }
        }

        return ids;
    }

    /// <summary>
    /// Runs <paramref name="sql"/> for <paramref name="ids"/>, at most <see cref="ItemIdChunk"/> of them at a time, with
    /// the chunk's id parameters in place of its <c>{0}</c>.
    /// </summary>
    private static void ForEachIdChunk(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        IReadOnlyList<string> ids,
        string sql,
        Action<SqliteCommand> run)
    {
        for (var offset = 0; offset < ids.Count; offset += ItemIdChunk)
        {
            var count = Math.Min(ItemIdChunk, ids.Count - offset);
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            var parameters = new string[count];
            for (var index = 0; index < count; index++)
            {
                var name = "$p" + index.ToString(CultureInfo.InvariantCulture);
                parameters[index] = name;
                command.Parameters.AddWithValue(name, ids[offset + index]);
            }

            command.CommandText = string.Format(CultureInfo.InvariantCulture, sql, string.Join(", ", parameters));
            run(command);
        }
    }

    /// <summary>How many of <paramref name="ids"/>, which are distinct, name an item.</summary>
    private static int CountItems(SqliteConnection connection, SqliteTransaction? transaction, IReadOnlyList<string> ids)
    {
        var count = 0;
        ForEachIdChunk(connection, transaction, ids, "SELECT COUNT(*) FROM items WHERE id IN ({0});", command =>
            count += Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture));
        return count;
    }

    /// <summary>
    /// Reads <paramref name="columns"/>, the first of which is the id, of each of <paramref name="ids"/> that names an
    /// item, keyed by its id.
    /// </summary>
    private static Dictionary<string, T> ReadItemRows<T>(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        IReadOnlyList<string> ids,
        string columns,
        Func<SqliteDataReader, T> read)
    {
        var rows = new Dictionary<string, T>(StringComparer.Ordinal);
        ForEachIdChunk(connection, transaction, ids, $"SELECT {columns} FROM items WHERE id IN ({{0}});", command =>
        {
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                rows[reader.GetString(0)] = read(reader);
            }
        });
        return rows;
    }

    private static string? ResolveItemByPath(SqliteConnection connection, SqliteTransaction transaction, string fullPath)
    {
        return ScalarString(
            connection,
            transaction,
            "SELECT id FROM items WHERE full_path_fold = $fold ORDER BY position LIMIT 1;",
            ("$fold", LibraryCatalogStore.Fold(fullPath.Trim())));
    }

    private static CatalogItemState? ReadItemState(SqliteConnection connection, SqliteTransaction? transaction, string identifier)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT id, full_path, is_favorite, is_blacklisted, play_count, last_played_utc, rating
            FROM items
            WHERE id = $id
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$id", identifier.Trim());
        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        return new CatalogItemState
        {
            Id = reader.GetString(0),
            FullPath = reader.GetString(1),
            IsFavorite = reader.GetInt32(2) != 0,
            IsBlacklisted = reader.GetInt32(3) != 0,
            PlayCount = reader.GetInt32(4),
            LastPlayedUtc = LibraryCatalogStore.ReadUtc(reader, 5),
            RatingHalfStars = reader.IsDBNull(6) ? null : reader.GetInt32(6)
        };
    }

    private static List<string> ReadItemIdsForTagFold(SqliteConnection connection, SqliteTransaction transaction, string fold)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT DISTINCT item_id FROM item_tags WHERE name_fold = $fold;";
        command.Parameters.AddWithValue("$fold", fold);
        using var reader = command.ExecuteReader();
        var ids = new List<string>();
        while (reader.Read())
        {
            if (reader.IsDBNull(0))
            {
                continue;
            }

            var id = reader.GetString(0);
            if (!string.IsNullOrWhiteSpace(id))
            {
                ids.Add(id);
            }
        }

        ids.Sort(StringComparer.Ordinal);
        return ids;
    }

    private static List<string> ReadItemTagNames(SqliteConnection connection, SqliteTransaction transaction, string itemId)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT name FROM item_tags WHERE item_id = $item ORDER BY position;";
        command.Parameters.AddWithValue("$item", itemId);
        using var reader = command.ExecuteReader();
        var tags = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        while (reader.Read())
        {
            var name = reader.GetString(0);
            if (seen.Add(name))
            {
                tags.Add(name);
            }
        }

        tags.Sort(StringComparer.OrdinalIgnoreCase);
        return tags;
    }

    private bool Commit(Func<SqliteConnection, SqliteTransaction, bool> mutate)
    {
        if (_writeScope.Value is { } scope)
        {
            var savepoint = scope.NextSavepoint();
            LibraryCatalogStore.Execute(scope.Connection, scope.Transaction, $"SAVEPOINT {savepoint};");
            if (!mutate(scope.Connection, scope.Transaction))
            {
                LibraryCatalogStore.Execute(scope.Connection, scope.Transaction, $"ROLLBACK TO {savepoint};");
                LibraryCatalogStore.Execute(scope.Connection, scope.Transaction, $"RELEASE {savepoint};");
                return false;
            }

            LibraryCatalogStore.Execute(scope.Connection, scope.Transaction, $"RELEASE {savepoint};");
            scope.Changed = true;
            return true;
        }

        var committed = false;
        using (var connection = LibraryCatalogStore.OpenWrite(_databasePath))
        using (var transaction = connection.BeginTransaction())
        {
            if (!mutate(connection, transaction))
            {
                transaction.Rollback();
                return false;
            }

            LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                UPDATE catalog_meta
                SET value = CAST((CAST(value AS INTEGER) + 1) AS TEXT)
                WHERE key = 'revision';
                """);
            transaction.Commit();
            committed = true;
        }

        if (committed)
        {
            NotifySuccessfulWrite();
        }

        return true;
    }

    private void NotifySuccessfulWrite()
    {
        var callback = AfterSuccessfulWrite;
        if (callback == null)
        {
            return;
        }

        try
        {
            callback();
        }
        catch (Exception)
        {
            // A catalog commit stays in place when a follow-up such as a backup fails.
        }
    }

    private sealed class WriteScope
    {
        private int _savepoints;

        public WriteScope(SqliteConnection connection, SqliteTransaction transaction)
        {
            Connection = connection;
            Transaction = transaction;
        }

        public SqliteConnection Connection { get; }

        public SqliteTransaction Transaction { get; }

        public bool Changed { get; set; }

        public string NextSavepoint() => "catalog_save_" + _savepoints++;
    }

    private static void WriteItemTags(SqliteConnection connection, SqliteTransaction transaction, string itemId, IReadOnlyList<string> tags)
    {
        var position = 0;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var name in tags)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            var trimmed = name.Trim();
            var fold = LibraryCatalogStore.Fold(trimmed);
            if (!seen.Add(fold))
            {
                continue;
            }

            LibraryCatalogStore.Execute(
                connection,
                transaction,
                "INSERT INTO item_tags (item_id, position, name, name_fold) VALUES ($item, $position, $name, $fold);",
                ("$item", itemId),
                ("$position", position),
                ("$name", trimmed),
                ("$fold", fold));
            position++;
        }
    }

    private static bool InsertCatalogTagIfMissing(SqliteConnection connection, SqliteTransaction transaction, string name)
    {
        EnsureUncategorized(connection, transaction);
        var fold = LibraryCatalogStore.Fold(name);
        var existing = ScalarInt(connection, transaction, "SELECT position FROM tags WHERE name_fold = $fold;", ("$fold", fold));
        if (existing != null)
        {
            return false;
        }

        var next = NextPosition(connection, transaction, "tags");
        return LibraryCatalogStore.Execute(
            connection,
            transaction,
            "INSERT INTO tags (position, name, name_fold, category_id) VALUES ($position, $name, $fold, $category);",
            ("$position", next),
            ("$name", name),
            ("$fold", fold),
            ("$category", LibraryCatalogStore.UncategorizedCategoryId)) > 0;
    }

    private static bool EnsureUncategorized(SqliteConnection connection, SqliteTransaction transaction)
    {
        var existing = ScalarString(
            connection,
            transaction,
            "SELECT id FROM categories WHERE id = $id COLLATE NOCASE;",
            ("$id", LibraryCatalogStore.UncategorizedCategoryId));
        if (existing == null)
        {
            var position = NextPosition(connection, transaction, "categories");
            return LibraryCatalogStore.Execute(
                connection,
                transaction,
                "INSERT INTO categories (id, position, name, sort_order) VALUES ($id, $position, $name, $sort);",
                ("$id", LibraryCatalogStore.UncategorizedCategoryId),
                ("$position", position),
                ("$name", LibraryCatalogStore.UncategorizedCategoryName),
                ("$sort", int.MaxValue)) > 0;
        }

        return LibraryCatalogStore.Execute(
            connection,
            transaction,
            "UPDATE categories SET id = $id, name = $name, sort_order = $sort WHERE id = $existing;",
            ("$id", LibraryCatalogStore.UncategorizedCategoryId),
            ("$name", LibraryCatalogStore.UncategorizedCategoryName),
            ("$sort", int.MaxValue),
            ("$existing", existing)) > 0;
    }

    private static int NextPosition(SqliteConnection connection, SqliteTransaction transaction, string table)
    {
        var current = ScalarInt(connection, transaction, $"SELECT MAX(position) FROM {table};");
        return (current ?? -1) + 1;
    }

    private static int NextItemTagPosition(SqliteConnection connection, SqliteTransaction transaction, string itemId)
    {
        var current = ScalarInt(connection, transaction, "SELECT MAX(position) FROM item_tags WHERE item_id = $item;", ("$item", itemId));
        return (current ?? -1) + 1;
    }

    private static List<string> DistinctTagNames(IReadOnlyList<string> tags)
    {
        var names = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var tag in tags)
        {
            if (string.IsNullOrWhiteSpace(tag))
            {
                continue;
            }

            var trimmed = tag.Trim();
            if (seen.Add(trimmed))
            {
                names.Add(trimmed);
            }
        }

        return names;
    }

    private static int? ScalarInt(SqliteConnection connection, SqliteTransaction transaction, string sql, params (string Name, object Value)[] parameters)
    {
        var value = Scalar(connection, transaction, sql, parameters);
        return value switch
        {
            null or DBNull => null,
            long number => (int)number,
            int number => number,
            _ => Convert.ToInt32(value, CultureInfo.InvariantCulture)
        };
    }

    private static string? ScalarString(SqliteConnection connection, SqliteTransaction transaction, string sql, params (string Name, object Value)[] parameters)
    {
        var value = Scalar(connection, transaction, sql, parameters);
        return value as string;
    }

    private static object? Scalar(SqliteConnection connection, SqliteTransaction transaction, string sql, params (string Name, object Value)[] parameters)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value);
        }

        return command.ExecuteScalar();
    }

    private readonly record struct CatalogTag(int Position, string CategoryId);

    private static List<CatalogTag> ReadTagsByFold(SqliteConnection connection, SqliteTransaction transaction, string fold)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT position, category_id FROM tags WHERE name_fold = $fold ORDER BY position;";
        command.Parameters.AddWithValue("$fold", fold);
        using var reader = command.ExecuteReader();
        var rows = new List<CatalogTag>();
        while (reader.Read())
        {
            rows.Add(new CatalogTag(reader.GetInt32(0), reader.GetString(1)));
        }

        return rows;
    }

    private static string WinningCategory(List<CatalogTag> tags)
    {
        var winner = LibraryCatalogStore.NormalizeCategoryId(tags[0].CategoryId);
        for (var i = 1; i < tags.Count; i++)
        {
            var candidate = LibraryCatalogStore.NormalizeCategoryId(tags[i].CategoryId);
            var winnerUncategorized = string.Equals(winner, LibraryCatalogStore.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase);
            var candidateUncategorized = string.Equals(candidate, LibraryCatalogStore.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase);
            if (winnerUncategorized && !candidateUncategorized)
            {
                winner = candidate;
            }
        }

        return winner;
    }

    private static int ScalarCount(SqliteConnection connection, string where, LibraryCatalogListSql.SqlArgs args)
    {
        using var command = connection.CreateCommand();
        command.CommandText = ListCountSql(where);
        args.Bind(command);
        var value = command.ExecuteScalar();
        return value is long count ? (int)count : Convert.ToInt32(value, CultureInfo.InvariantCulture);
    }

    private static List<CatalogAutoTagScanItem> ReadAutoTagItems(SqliteCommand command)
    {
        using var reader = command.ExecuteReader();
        var items = new List<CatalogAutoTagScanItem>();
        while (reader.Read())
        {
            items.Add(ReadAutoTagItem(reader));
        }

        return items;
    }

    private static CatalogAutoTagScanItem ReadAutoTagItem(SqliteDataReader reader)
    {
        return new CatalogAutoTagScanItem
        {
            Id = reader.GetString(0),
            FullPath = reader.GetString(1),
            RelativePath = reader.GetString(2),
            FileName = reader.GetString(3)
        };
    }

    private static Dictionary<string, List<string>> ReadAllItemTags(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT item_id, name FROM item_tags ORDER BY item_id, position;";
        return LibraryCatalogStore.ReadTagGroups(command);
    }

    private static List<LibraryCatalogTag> ReadCatalogTags(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT name, name_fold, category_id FROM tags ORDER BY position;";
        using var reader = command.ExecuteReader();
        var tags = new List<LibraryCatalogTag>();
        while (reader.Read())
        {
            tags.Add(new LibraryCatalogTag
            {
                Name = reader.GetString(0),
                NameFold = reader.GetString(1),
                CategoryId = reader.GetString(2)
            });
        }

        return tags;
    }

    private static LibraryCatalogItem ReadListedItem(SqliteDataReader reader)
    {
        return new LibraryCatalogItem
        {
            Id = reader.GetString(0),
            SourceId = reader.GetString(1),
            FullPath = reader.GetString(2),
            FullPathFold = reader.GetString(3),
            RelativePath = reader.GetString(4),
            RelativePathFold = reader.GetString(5),
            FileName = reader.GetString(6),
            FileNameFold = reader.GetString(7),
            DurationTicks = reader.IsDBNull(8) ? null : reader.GetInt64(8),
            HasAudio = reader.IsDBNull(9) ? null : reader.GetInt32(9) != 0,
            IntegratedLoudness = reader.IsDBNull(10) ? null : reader.GetDouble(10),
            PeakDb = reader.IsDBNull(11) ? null : reader.GetDouble(11),
            IsFavorite = reader.GetInt32(12) != 0,
            IsBlacklisted = reader.GetInt32(13) != 0,
            PlayCount = reader.GetInt32(14),
            LastPlayedUtc = LibraryCatalogStore.ReadUtc(reader, 15),
            MediaType = reader.GetInt32(16),
            Fingerprint = reader.IsDBNull(17) ? null : reader.GetString(17),
            FingerprintAlgorithm = reader.GetString(18),
            FingerprintVersion = reader.GetInt32(19),
            FileSizeBytes = reader.IsDBNull(20) ? null : reader.GetInt64(20),
            LastWriteTimeUtc = LibraryCatalogStore.ReadUtc(reader, 21),
            FingerprintLastUtc = LibraryCatalogStore.ReadUtc(reader, 22),
            FingerprintStatus = reader.IsDBNull(23) ? null : reader.GetInt32(23),
            LoudnessError = reader.IsDBNull(24) ? null : reader.GetString(24),
            ThumbnailRevision = reader.IsDBNull(25) ? null : reader.GetString(25),
            ThumbnailWidth = reader.IsDBNull(26) ? null : reader.GetInt32(26),
            ThumbnailHeight = reader.IsDBNull(27) ? null : reader.GetInt32(27),
            RatingHalfStars = reader.IsDBNull(28) ? null : reader.GetInt32(28),
            DateAddedUtc = LibraryCatalogStore.ReadUtc(reader, 29)
        };
    }

    private static void AttachTags(SqliteConnection connection, IReadOnlyList<LibraryCatalogItem> items)
    {
        if (items.Count == 0)
        {
            return;
        }

        var args = new LibraryCatalogListSql.SqlArgs();
        var names = new string[items.Count];
        for (var i = 0; i < items.Count; i++)
        {
            names[i] = args.Add(items[i].Id);
        }

        using var command = connection.CreateCommand();
        command.CommandText = $"SELECT item_id, name FROM item_tags WHERE item_id IN ({string.Join(", ", names)}) ORDER BY item_id, position;";
        args.Bind(command);
        var tagsByItem = LibraryCatalogStore.ReadTagGroups(command);
        foreach (var item in items)
        {
            if (tagsByItem.TryGetValue(item.Id, out var tags))
            {
                item.Tags = tags;
            }
        }
    }

    private static JsonObject ToItem(LibraryCatalogItem item)
    {
        var node = new JsonObject
        {
            ["id"] = item.Id,
            ["sourceId"] = item.SourceId,
            ["fullPath"] = item.FullPath,
            ["relativePath"] = item.RelativePath,
            ["fileName"] = item.FileName,
            ["isFavorite"] = item.IsFavorite,
            ["isBlacklisted"] = item.IsBlacklisted,
            ["playCount"] = item.PlayCount,
            ["mediaType"] = item.MediaType,
            ["fingerprintAlgorithm"] = item.FingerprintAlgorithm,
            ["fingerprintVersion"] = item.FingerprintVersion,
            ["tags"] = new JsonArray(item.Tags.Select(tag => (JsonNode)tag).ToArray())
        };
        if (item.DurationTicks is long ticks)
        {
            node["duration"] = FormatDuration(ticks);
            node["durationSeconds"] = ticks / (double)TimeSpan.TicksPerSecond;
        }

        if (item.HasAudio is bool hasAudio)
        {
            node["hasAudio"] = hasAudio;
        }

        if (item.IntegratedLoudness is double loudness)
        {
            node["integratedLoudness"] = loudness;
        }

        if (item.PeakDb is double peak)
        {
            node["peakDb"] = peak;
        }

        if (item.RatingHalfStars is int halfStars)
        {
            node["rating"] = ItemRating.ToStars(halfStars);
        }

        if (item.LoudnessError != null)
        {
            node["loudnessError"] = item.LoudnessError;
        }

        if (item.LastPlayedUtc is DateTime played)
        {
            node["lastPlayedUtc"] = FormatUtc(played);
        }

        if (item.Fingerprint != null)
        {
            node["fingerprint"] = item.Fingerprint;
        }

        if (item.FileSizeBytes is long size)
        {
            node["fileSizeBytes"] = size;
        }

        if (item.DateAddedUtc is DateTime added)
        {
            node["dateAddedUtc"] = FormatUtc(added);
        }

        // The date created is the file's modified time.
        if (item.LastWriteTimeUtc is DateTime written)
        {
            node["dateCreatedUtc"] = FormatUtc(written);
        }

        if (item.FingerprintLastUtc is DateTime fingerprinted)
        {
            node["fingerprintLastUtc"] = FormatUtc(fingerprinted);
        }

        if (item.FingerprintStatus is int status)
        {
            node["fingerprintStatus"] = status;
        }

        return node;
    }

    internal static string FormatDuration(long ticks)
    {
        if (ticks < 0)
        {
            ticks = 0;
        }

        var seconds = ticks / TimeSpan.TicksPerSecond;
        var hours = seconds / 3600;
        var minutes = (seconds % 3600) / 60;
        var secs = seconds % 60;
        return string.Format(CultureInfo.InvariantCulture, "{0:00}:{1:00}:{2:00}", hours, minutes, secs);
    }

    private readonly record struct StatsGroup(
        string SourceId,
        bool IsPhoto,
        long Total,
        long Favorites,
        long Blacklisted,
        long Rated,
        long Played,
        long Plays,
        long WithAudio,
        long WithoutAudio,
        long DurationSeconds,
        long DurationCount);

    private static List<StatsGroup> ReadStatsGroups(SqliteConnection connection)
    {
        var ticks = TimeSpan.TicksPerSecond.ToString(CultureInfo.InvariantCulture);
        using var command = connection.CreateCommand();
        command.CommandText = $"""
            SELECT
              source_id,
              media_type,
              COUNT(*),
              SUM(CASE WHEN is_favorite != 0 THEN 1 ELSE 0 END),
              SUM(CASE WHEN is_blacklisted != 0 THEN 1 ELSE 0 END),
              COUNT(rating),
              SUM(CASE WHEN play_count > 0 THEN 1 ELSE 0 END),
              SUM(CASE WHEN play_count > 0 THEN play_count ELSE 0 END),
              SUM(CASE WHEN has_audio IS NOT NULL AND has_audio != 0 THEN 1 ELSE 0 END),
              SUM(CASE WHEN has_audio IS NOT NULL AND has_audio = 0 THEN 1 ELSE 0 END),
              COALESCE(SUM((CASE WHEN duration_ticks < 0 THEN 0 ELSE duration_ticks END) / {ticks}), 0),
              COUNT(duration_ticks)
            FROM items
            GROUP BY source_id, media_type;
            """;
        using var reader = command.ExecuteReader();
        var groups = new List<StatsGroup>();
        while (reader.Read())
        {
            groups.Add(new StatsGroup(
                reader.GetString(0),
                reader.GetInt32(1) == (int)MediaTypeValue.Photo,
                reader.GetInt64(2),
                reader.GetInt64(3),
                reader.GetInt64(4),
                reader.GetInt64(5),
                reader.GetInt64(6),
                reader.GetInt64(7),
                reader.GetInt64(8),
                reader.GetInt64(9),
                reader.GetInt64(10),
                reader.GetInt64(11)));
        }

        return groups;
    }

    private static CatalogGlobalStats BuildGlobalStats(IReadOnlyList<StatsGroup> groups, double baselineLoudness)
    {
        var videos = groups.Where(group => !group.IsPhoto).ToList();
        var photos = groups.Where(group => group.IsPhoto).ToList();
        var totalVideos = ToCount(videos.Sum(group => group.Total));
        var totalPhotos = ToCount(photos.Sum(group => group.Total));
        var uniquePlayedMedia = ToCount(groups.Sum(group => group.Played));
        return new CatalogGlobalStats
        {
            TotalVideos = totalVideos,
            TotalPhotos = totalPhotos,
            TotalMedia = totalVideos + totalPhotos,
            Favorites = ToCount(groups.Sum(group => group.Favorites)),
            Blacklisted = ToCount(groups.Sum(group => group.Blacklisted)),
            Rated = ToCount(groups.Sum(group => group.Rated)),
            UniquePlayedMedia = uniquePlayedMedia,
            NeverPlayedMedia = Math.Max(0, totalVideos + totalPhotos - uniquePlayedMedia),
            TotalPlays = ToCount(groups.Sum(group => group.Plays)),
            VideosWithAudio = ToCount(videos.Sum(group => group.WithAudio)),
            VideosWithoutAudio = ToCount(videos.Sum(group => group.WithoutAudio)),
            BaselineLoudnessLufs = baselineLoudness
        };
    }

    private static double ReadBaselineLoudness(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT integrated_loudness
            FROM items
            WHERE media_type = 0
              AND has_audio = 1
              AND integrated_loudness IS NOT NULL
            ORDER BY integrated_loudness ASC;
            """;
        var values = new List<double>();
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                values.Add(reader.GetDouble(0));
            }
        }

        if (values.Count == 0)
        {
            return DefaultBaselineLoudnessLufs;
        }

        var index = (int)Math.Ceiling(values.Count * 0.75d) - 1;
        index = Math.Clamp(index, 0, values.Count - 1);
        return values[index];
    }

    private static List<CatalogSourceStats> BuildSourceStats(SqliteConnection connection, IReadOnlyList<StatsGroup> groups)
    {
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, root_path, display_name, is_enabled
            FROM sources
            WHERE TRIM(id) != ''
            ORDER BY position;
            """;
        using var reader = command.ExecuteReader();
        var sources = new List<CatalogSourceStats>();
        while (reader.Read())
        {
            var sourceId = reader.GetString(0);
            var videos = groups
                .Where(group => !group.IsPhoto && string.Equals(group.SourceId, sourceId, StringComparison.OrdinalIgnoreCase))
                .ToList();
            var photos = groups
                .Where(group => group.IsPhoto && string.Equals(group.SourceId, sourceId, StringComparison.OrdinalIgnoreCase))
                .ToList();
            var totalVideos = ToCount(videos.Sum(group => group.Total));
            var totalPhotos = ToCount(photos.Sum(group => group.Total));
            var durationSeconds = videos.Sum(group => group.DurationSeconds);
            sources.Add(new CatalogSourceStats
            {
                SourceId = sourceId,
                RootPath = reader.GetString(1),
                DisplayName = reader.IsDBNull(2) ? null : reader.GetString(2),
                IsEnabled = reader.GetInt64(3) != 0,
                TotalVideos = totalVideos,
                TotalPhotos = totalPhotos,
                TotalMedia = totalVideos + totalPhotos,
                VideosWithAudio = ToCount(videos.Sum(group => group.WithAudio)),
                VideosWithoutAudio = ToCount(videos.Sum(group => group.WithoutAudio)),
                TotalDurationSeconds = durationSeconds,
                AverageDurationSeconds = AverageDurationSeconds(durationSeconds, videos.Sum(group => group.DurationCount))
            });
        }

        return sources;
    }

    private static double? AverageDurationSeconds(long sumWholeSeconds, long count)
    {
        if (count <= 0)
        {
            return null;
        }

        var averageTicks = (long)(sumWholeSeconds * (double)TimeSpan.TicksPerSecond / count);
        return TimeSpan.FromTicks(averageTicks).TotalSeconds;
    }

    private static int ToCount(long value) => Convert.ToInt32(value, CultureInfo.InvariantCulture);

    private static string FormatUtc(DateTime value)
    {
        var utc = value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        return utc.ToString("o", CultureInfo.InvariantCulture);
    }
}

public sealed class CatalogTagEditorRead
{
    public List<LibraryCatalogCategory> Categories { get; init; } = [];
    public List<LibraryCatalogTag> Tags { get; init; } = [];
    public List<CatalogItemTagRead> Items { get; init; } = [];

    /// <summary>With counts only, each tag the named items hold and how many of them hold it; otherwise null.</summary>
    public List<CatalogTagItemCount>? TagCounts { get; init; }

    /// <summary>With counts only, how many of the named items are in the library; otherwise null.</summary>
    public int? ItemCount { get; init; }
}

public readonly record struct CatalogTagItemCount(string Name, int ItemCount);

public sealed class CatalogItemTagRead
{
    public string ItemId { get; init; } = string.Empty;
    public List<string> Tags { get; init; } = [];
}

public sealed class CatalogLibraryStats
{
    public CatalogGlobalStats Global { get; init; } = new();
    public List<CatalogSourceStats> Sources { get; init; } = [];
}

public sealed class CatalogGlobalStats
{
    public int TotalVideos { get; init; }
    public int TotalPhotos { get; init; }
    public int TotalMedia { get; init; }
    public int Favorites { get; init; }
    public int Blacklisted { get; init; }
    public int Rated { get; init; }
    public int UniquePlayedMedia { get; init; }
    public int NeverPlayedMedia { get; init; }
    public int TotalPlays { get; init; }
    public int VideosWithAudio { get; init; }
    public int VideosWithoutAudio { get; init; }
    public double BaselineLoudnessLufs { get; init; } = -18.0;
}

public sealed class CatalogSourceStats
{
    public string SourceId { get; init; } = string.Empty;
    public string RootPath { get; init; } = string.Empty;
    public string? DisplayName { get; init; }
    public bool IsEnabled { get; init; } = true;
    public int TotalVideos { get; init; }
    public int TotalPhotos { get; init; }
    public int TotalMedia { get; init; }
    public int VideosWithAudio { get; init; }
    public int VideosWithoutAudio { get; init; }
    public double TotalDurationSeconds { get; init; }
    public double? AverageDurationSeconds { get; init; }
}

public sealed class CatalogItemState
{
    public string Id { get; init; } = string.Empty;
    public string FullPath { get; init; } = string.Empty;
    public bool IsFavorite { get; init; }
    public bool IsBlacklisted { get; init; }
    public int PlayCount { get; init; }
    public DateTime? LastPlayedUtc { get; init; }
    public DateTime? PreviousLastPlayedUtc { get; init; }

    /// <summary>The rating in half stars, or null for none (see <see cref="ItemRating"/>).</summary>
    public int? RatingHalfStars { get; init; }
}

/// <summary>
/// A playback stats clear: how many of the named items, or with every item, how many items, are in the library, and how
/// many of them had stats to clear.
/// </summary>
public readonly record struct CatalogPlaybackStatsClear(int Count, int Changed);

/// <summary>The flag a bulk change sets or clears.</summary>
public enum CatalogItemFlag
{
    Favorite,
    Blacklist
}

/// <summary>One item's favorite and blacklist before and after a favorite or blacklist change.</summary>
public sealed class CatalogItemFlagChange
{
    public string Id { get; init; } = string.Empty;
    public string FullPath { get; init; } = string.Empty;
    public bool IsFavorite { get; init; }
    public bool IsBlacklisted { get; init; }
    public bool PreviousIsFavorite { get; init; }
    public bool PreviousIsBlacklisted { get; init; }

    public bool Changed => IsFavorite != PreviousIsFavorite || IsBlacklisted != PreviousIsBlacklisted;
}

/// <summary>One item's rating, in half stars or null for none, before and after a rating change.</summary>
public sealed class CatalogItemRatingChange
{
    public string Id { get; init; } = string.Empty;
    public string FullPath { get; init; } = string.Empty;
    public int? RatingHalfStars { get; init; }
    public int? PreviousRatingHalfStars { get; init; }

    public bool Changed => RatingHalfStars != PreviousRatingHalfStars;
}

public sealed class CatalogPlaybackItem
{
    public string Id { get; init; } = string.Empty;
    public string FullPath { get; init; } = string.Empty;
    public string FileName { get; init; } = string.Empty;
    public int MediaType { get; init; }
    public long? DurationTicks { get; init; }
    public bool IsFavorite { get; init; }
    public bool IsBlacklisted { get; init; }
    public bool IsSourceEnabled { get; init; }
    public double? IntegratedLoudness { get; init; }
    public double? PeakDb { get; init; }
    public int? RatingHalfStars { get; init; }
}

public enum CatalogAutoTagScanScope
{
    All,
    EnabledSources
}

public enum CatalogDuplicateScanScope
{
    All,
    EnabledSources,
    Source
}

public sealed class CatalogAutoTagScanItem
{
    public string Id { get; init; } = string.Empty;
    public string FullPath { get; init; } = string.Empty;
    public string RelativePath { get; init; } = string.Empty;
    public string FileName { get; init; } = string.Empty;
    public List<string> Tags { get; init; } = [];
}

public sealed class CatalogDuplicateScanItem
{
    public string Id { get; init; } = string.Empty;
    public string FullPath { get; init; } = string.Empty;
    public string SourceId { get; init; } = string.Empty;
    public string? Fingerprint { get; init; }
    public int? FingerprintStatus { get; init; }
    public bool IsFavorite { get; init; }
    public bool IsBlacklisted { get; init; }
    public int PlayCount { get; init; }
    public int TagCount { get; init; }
}

public sealed class CatalogNameSortKeyWork
{
    public IReadOnlyList<CatalogNameSortKeyItem> Items { get; init; } = [];

    /// <summary>The stored key version differs, so every item is listed and the version is written after.</summary>
    public bool VersionChanged { get; init; }
}

public readonly record struct CatalogNameSortKeyItem(string Id, string FileName);

public sealed class CatalogStoredItem
{
    public string Id { get; init; } = string.Empty;
    public string FullPath { get; init; } = string.Empty;
}

public sealed class CatalogRefreshSource
{
    public string Id { get; init; } = string.Empty;
    public string RootPath { get; init; } = string.Empty;
    public bool IsEnabled { get; init; }
}

public sealed class CatalogRefreshItem
{
    public string Id { get; set; } = string.Empty;
    public string SourceId { get; set; } = string.Empty;
    public string FullPath { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public int MediaType { get; set; }
    public long? DurationTicks { get; set; }
    public bool? HasAudio { get; set; }
    public double? IntegratedLoudness { get; set; }
    public double? PeakDb { get; set; }
    public string? Fingerprint { get; set; }
    public string FingerprintAlgorithm { get; set; } = string.Empty;
    public int FingerprintVersion { get; set; } = 1;
    public long? FileSizeBytes { get; set; }
    public DateTime? LastWriteTimeUtc { get; set; }
    public DateTime? FingerprintLastUtc { get; set; }
    public int? FingerprintStatus { get; set; }
    public string? LoudnessError { get; set; }
    public string? ThumbnailRevision { get; set; }
    public int? ThumbnailWidth { get; set; }
    public int? ThumbnailHeight { get; set; }

    /// <summary>The loudness analysis version the stored loudness and peak were scanned under, or 0 before any scan recorded one.</summary>
    public int LoudnessAnalysisVersion { get; set; }
}

public sealed class CatalogAutoTagAssignment
{
    public string TagName { get; init; } = string.Empty;
    public IReadOnlyList<string> ItemPaths { get; init; } = [];
}

public sealed class CatalogAutoTagAppliedAssignment
{
    public string TagName { get; init; } = string.Empty;
    public List<string> ChangedItemIds { get; init; } = [];
}

public sealed class CatalogAutoTagApplyResult
{
    public List<CatalogAutoTagAppliedAssignment> Applied { get; init; } = [];
}

public readonly record struct CatalogSourceImportFile(string FullPath, string RelativePath, string FileName, int MediaType);

public sealed class CatalogSourceImportResult
{
    public string SourceId { get; init; } = string.Empty;
    public int ImportedCount { get; init; }
    public int UpdatedCount { get; init; }
}

