using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Storage;

namespace ReelRoulette.Core.Library;

public sealed class LibraryCatalogSession
{
    private const int ItemStatePathChunk = 500;
    private const double DefaultBaselineLoudnessLufs = -18.0;
    private const string PhotoExtensionsSql =
        "'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.heic', '.heif', '.avif', '.ico', '.svg', '.raw', '.cr2', '.nef', '.orf', '.sr2'";

    private readonly string _databasePath;
    private readonly AsyncLocal<WriteScope?> _writeScope = new();

    public LibraryCatalogSession(string databasePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(databasePath);
        _databasePath = databasePath;
    }

    public string DatabasePath => _databasePath;

    public Action? AfterSuccessfulWrite { get; set; }

    public long Revision
    {
        get
        {
            using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT value FROM catalog_meta WHERE key = 'revision';";
            var value = command.ExecuteScalar() as string;
            return long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var revision) ? revision : 0;
        }
    }

    public LibraryListResult QueryList(LibraryListRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        LibraryCatalogListSql.RegisterCollation(connection);

        var catalogTags = ReadCatalogTags(connection);
        var searchArgs = new LibraryCatalogListSql.SqlArgs();
        var searchWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: false, catalogTags, searchArgs);
        var searchBaselineCount = ScalarCount(connection, searchWhere, searchArgs);

        var filterArgs = new LibraryCatalogListSql.SqlArgs();
        var filterWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, catalogTags, filterArgs);
        var totalCount = ScalarCount(connection, filterWhere, filterArgs);

        var pageArgs = new LibraryCatalogListSql.SqlArgs();
        var pageWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, catalogTags, pageArgs);
        var orderBy = LibraryCatalogListSql.BuildOrderBy(request);
        var limit = pageArgs.Add(request.Limit);
        var offset = pageArgs.Add(request.Offset);
        using var command = connection.CreateCommand();
        command.CommandText = $"""
            SELECT items.id, items.source_id, items.full_path, items.full_path_fold, items.relative_path, items.relative_path_fold,
                   items.file_name, items.file_name_fold, items.duration_ticks, items.has_audio, items.integrated_loudness, items.peak_db,
                   items.is_favorite, items.is_blacklisted, items.play_count, items.last_played_utc, items.media_type, items.fingerprint,
                   items.fingerprint_algorithm, items.fingerprint_version, items.file_size_bytes, items.last_write_time_utc,
                   items.fingerprint_last_utc, items.fingerprint_status, items.loudness_error,
                   items.thumbnail_revision, items.thumbnail_width, items.thumbnail_height
            {LibraryCatalogListSql.FromClause}
            {pageWhere}
            {orderBy}
            LIMIT {limit} OFFSET {offset};
            """;
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
        return new LibraryListResult
        {
            Items = items,
            TotalCount = totalCount,
            SearchBaselineCount = searchBaselineCount
        };
    }

    public IReadOnlyList<LibraryCatalogItem> QueryEligible(FilterStateModel filter, MediaTypeValue? requiredMediaType = null)
    {
        ArgumentNullException.ThrowIfNull(filter);
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        LibraryCatalogListSql.RegisterCollation(connection);

        var request = new LibraryListRequest { Filter = filter };
        var catalogTags = ReadCatalogTags(connection);
        var args = new LibraryCatalogListSql.SqlArgs();
        var where = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, catalogTags, args);
        if (requiredMediaType.HasValue)
        {
            where += " AND items.media_type = " + ((int)requiredMediaType.Value).ToString(CultureInfo.InvariantCulture);
        }

        using var command = connection.CreateCommand();
        command.CommandText = $"""
            SELECT items.id, items.source_id, items.full_path, items.full_path_fold, items.relative_path, items.relative_path_fold,
                   items.file_name, items.file_name_fold, items.duration_ticks, items.has_audio, items.integrated_loudness, items.peak_db,
                   items.is_favorite, items.is_blacklisted, items.play_count, items.last_played_utc, items.media_type, items.fingerprint,
                   items.fingerprint_algorithm, items.fingerprint_version, items.file_size_bytes, items.last_write_time_utc,
                   items.fingerprint_last_utc, items.fingerprint_status, items.loudness_error,
                   items.thumbnail_revision, items.thumbnail_width, items.thumbnail_height
            {LibraryCatalogListSql.FromClause}
            {where};
            """;
        args.Bind(command);
        var items = new List<LibraryCatalogItem>();
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                items.Add(ReadListedItem(reader));
            }
        }

        return items;
    }

    public LibraryCatalogItem? ReadListedItem(string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return null;
        }

        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        LibraryCatalogItem? item;
        using (var transaction = connection.BeginTransaction())
        {
            var id = ResolveItemId(connection, transaction, identifier);
            if (id == null)
            {
                transaction.Rollback();
                return null;
            }

            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                SELECT items.id, items.source_id, items.full_path, items.full_path_fold, items.relative_path, items.relative_path_fold,
                       items.file_name, items.file_name_fold, items.duration_ticks, items.has_audio, items.integrated_loudness, items.peak_db,
                       items.is_favorite, items.is_blacklisted, items.play_count, items.last_played_utc, items.media_type, items.fingerprint,
                       items.fingerprint_algorithm, items.fingerprint_version, items.file_size_bytes, items.last_write_time_utc,
                       items.fingerprint_last_utc, items.fingerprint_status, items.loudness_error,
                       items.thumbnail_revision, items.thumbnail_width, items.thumbnail_height
                FROM items
                WHERE items.id = $id
                LIMIT 1;
                """;
            command.Parameters.AddWithValue("$id", id);
            using (var reader = command.ExecuteReader())
            {
                item = reader.Read() ? ReadListedItem(reader) : null;
            }

            transaction.Rollback();
        }

        if (item == null)
        {
            return null;
        }

        var tagged = new List<LibraryCatalogItem> { item };
        AttachTags(connection, tagged);
        return tagged[0];
    }

    public int CountItems()
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        return LibraryCatalogStore.ExecuteScalarInt(connection, "SELECT COUNT(*) FROM items;");
    }

    public CatalogLibraryStats ReadLibraryStats()
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        var global = ReadGlobalStats(connection);
        var sources = ReadSourceStats(connection);
        return new CatalogLibraryStats
        {
            Global = global,
            Sources = sources
        };
    }

    public IReadOnlyList<CatalogItemState> ReadItemStates(IReadOnlyList<string>? paths)
    {
        var folds = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var path in paths ?? [])
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                continue;
            }

            var fold = LibraryCatalogStore.Fold(path);
            if (seen.Add(fold))
            {
                folds.Add(fold);
            }
        }

        if (folds.Count == 0)
        {
            return [];
        }

        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        var items = new List<CatalogItemState>();
        for (var offset = 0; offset < folds.Count; offset += ItemStatePathChunk)
        {
            var count = Math.Min(ItemStatePathChunk, folds.Count - offset);
            using var command = connection.CreateCommand();
            var parameters = new string[count];
            for (var index = 0; index < count; index++)
            {
                var name = "$p" + index.ToString(CultureInfo.InvariantCulture);
                parameters[index] = name;
                command.Parameters.AddWithValue(name, folds[offset + index]);
            }

            command.CommandText = $"""
                SELECT id, full_path, is_favorite, is_blacklisted, play_count, last_played_utc
                FROM items
                WHERE full_path_fold IN ({string.Join(", ", parameters)});
                """;
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                items.Add(new CatalogItemState
                {
                    Id = reader.GetString(0),
                    FullPath = reader.GetString(1),
                    IsFavorite = reader.GetInt64(2) != 0,
                    IsBlacklisted = reader.GetInt64(3) != 0,
                    PlayCount = Convert.ToInt32(reader.GetInt64(4), CultureInfo.InvariantCulture),
                    LastPlayedUtc = LibraryCatalogStore.ReadUtc(reader, 5)
                });
            }
        }

        items.Sort((left, right) => StringComparer.OrdinalIgnoreCase.Compare(left.FullPath, right.FullPath));
        return items;
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

    public IReadOnlyList<CatalogAutoTagScanItem> ReadAutoTagScanItems(CatalogAutoTagScanScope scope, IReadOnlyList<string>? paths)
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        List<CatalogAutoTagScanItem> items;
        if (scope == CatalogAutoTagScanScope.Paths)
        {
            items = ReadAutoTagItemsByPaths(connection, paths);
        }
        else
        {
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
            items = ReadAutoTagItems(command);
        }

        if (items.Count == 0)
        {
            return items;
        }

        var tags = scope == CatalogAutoTagScanScope.Paths
            ? ReadTagsForItems(connection, items.Select(item => item.Id).ToList())
            : ReadAllItemTags(connection);
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

    public IReadOnlyList<CatalogStoredItem> ReadItemsByIds(IReadOnlyList<string> ids)
    {
        var requested = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var id in ids)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                continue;
            }

            var trimmed = id.Trim();
            if (seen.Add(trimmed))
            {
                requested.Add(trimmed);
            }
        }

        if (requested.Count == 0)
        {
            return [];
        }

        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        var rows = new List<(int Position, CatalogStoredItem Item)>();
        for (var offset = 0; offset < requested.Count; offset += ItemStatePathChunk)
        {
            var count = Math.Min(ItemStatePathChunk, requested.Count - offset);
            using var command = connection.CreateCommand();
            var parameters = new string[count];
            for (var index = 0; index < count; index++)
            {
                var name = "$p" + index.ToString(CultureInfo.InvariantCulture);
                parameters[index] = name;
                command.Parameters.AddWithValue(name, requested[offset + index]);
            }

            command.CommandText = $"""
                SELECT id, full_path, position
                FROM items
                WHERE id COLLATE NOCASE IN ({string.Join(", ", parameters)});
                """;
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                rows.Add((reader.GetInt32(2), new CatalogStoredItem
                {
                    Id = reader.GetString(0),
                    FullPath = reader.GetString(1)
                }));
            }
        }

        rows.Sort((left, right) => left.Position.CompareTo(right.Position));
        return rows.Select(row => row.Item).ToList();
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

    public IReadOnlyList<LibraryCatalogSource> ReadStartupSources()
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
                   thumbnail_revision, thumbnail_width, thumbnail_height
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
                ThumbnailHeight = reader.IsDBNull(20) ? null : reader.GetInt32(20)
            });
        }

        return items;
    }

    public IReadOnlyList<LibraryCatalogPreset> ReadPresets()
    {
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT name, filter_state FROM presets ORDER BY position;";
        using var reader = command.ExecuteReader();
        var presets = new List<LibraryCatalogPreset>();
        while (reader.Read())
        {
            presets.Add(new LibraryCatalogPreset
            {
                Name = reader.GetString(0),
                FilterStateJson = reader.GetString(1)
            });
        }

        return presets;
    }

    public void ReplacePresets(IReadOnlyList<LibraryCatalogPreset> presets)
    {
        ArgumentNullException.ThrowIfNull(presets);
        Commit((connection, transaction) =>
        {
            LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM presets;");
            for (var i = 0; i < presets.Count; i++)
            {
                var preset = presets[i];
                LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    """
                    INSERT INTO presets (position, name, name_fold, filter_state)
                    VALUES ($position, $name, $fold, $filter);
                    """,
                    ("$position", i),
                    ("$name", preset.Name),
                    ("$fold", LibraryCatalogStore.Fold(preset.Name)),
                    ("$filter", string.IsNullOrWhiteSpace(preset.FilterStateJson) ? "{}" : preset.FilterStateJson));
            }

            return true;
        });
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
                    fingerprint_last_utc, fingerprint_status, loudness_error)
                VALUES (
                    $id, $position, $source, $full, $fullFold, $relative, $relativeFold,
                    $file, $fileFold, $duration, $audio, $loudness, $peak,
                    $favorite, $blacklisted, $plays, $played, $media, $fingerprint,
                    $algorithm, $fpVersion, $size, $write, $fpLast, $fpStatus, $loudnessError);
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
                ("$loudnessError", (object?)item.LoudnessError ?? DBNull.Value)) > 0;
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
                    file_name = $file, file_name_fold = $fileFold, media_type = $media
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
        return Commit((connection, transaction) =>
        {
            LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM item_tags WHERE item_id = $id;", ("$id", id));
            return LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM items WHERE id = $id;", ("$id", id)) > 0;
        });
    }

    public bool SetFavorite(string identifier, bool isFavorite)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return false;
        }

        var favorite = isFavorite ? 1 : 0;
        return Commit((connection, transaction) =>
        {
            var id = ResolveItemId(connection, transaction, identifier);
            if (id == null)
            {
                return false;
            }

            return LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                UPDATE items
                SET is_favorite = $favorite,
                    is_blacklisted = CASE WHEN $favorite = 1 THEN 0 ELSE is_blacklisted END
                WHERE id = $id
                  AND (is_favorite != $favorite OR ($favorite = 1 AND is_blacklisted != 0));
                """,
                ("$id", id),
                ("$favorite", favorite)) > 0;
        });
    }

    public bool SetBlacklist(string identifier, bool isBlacklisted)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return false;
        }

        var blacklisted = isBlacklisted ? 1 : 0;
        return Commit((connection, transaction) =>
        {
            var id = ResolveItemId(connection, transaction, identifier);
            if (id == null)
            {
                return false;
            }

            return LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                UPDATE items
                SET is_blacklisted = $blacklisted,
                    is_favorite = CASE WHEN $blacklisted = 1 THEN 0 ELSE is_favorite END
                WHERE id = $id
                  AND (is_blacklisted != $blacklisted OR ($blacklisted = 1 AND is_favorite != 0));
                """,
                ("$id", id),
                ("$blacklisted", blacklisted)) > 0;
        });
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
            var id = ResolveItemId(connection, transaction, identifier);
            if (id == null)
            {
                return false;
            }

            var current = ReadItemState(connection, transaction, id);
            if (current == null)
            {
                return false;
            }

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
                PreviousLastPlayedUtc = previousLastPlayedUtc
            };
            return true;
        });
        return committed ? recorded : null;
    }

    public int ClearPlaybackStats(IReadOnlyCollection<string>? identifiers)
    {
        var requested = (identifiers ?? [])
            .Where(identifier => !string.IsNullOrWhiteSpace(identifier))
            .Select(identifier => identifier.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var cleared = 0;
        var committed = Commit((connection, transaction) =>
        {
            if (requested.Length == 0)
            {
                cleared = LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "UPDATE items SET play_count = 0, last_played_utc = NULL WHERE play_count != 0 OR last_played_utc IS NOT NULL;");
                return cleared > 0;
            }

            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var identifier in requested)
            {
                var id = ResolveItemId(connection, transaction, identifier);
                if (id == null || !seen.Add(id))
                {
                    continue;
                }

                cleared += LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "UPDATE items SET play_count = 0, last_played_utc = NULL WHERE id = $id AND (play_count != 0 OR last_played_utc IS NOT NULL);",
                    ("$id", id));
            }

            return cleared > 0;
        });
        return committed ? cleared : 0;
    }

    public CatalogItemState? ReadItemState(string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return null;
        }

        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var transaction = connection.BeginTransaction();
        var state = ReadItemState(connection, transaction, identifier);
        transaction.Rollback();
        return state;
    }

    public CatalogPlaybackItem? ReadPlaybackItem(string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return null;
        }

        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var transaction = connection.BeginTransaction();
        var id = ResolveItemId(connection, transaction, identifier);
        if (id == null)
        {
            transaction.Rollback();
            return null;
        }

        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT items.id, items.full_path, items.file_name, items.media_type, items.duration_ticks,
                   items.is_favorite, items.is_blacklisted, sources.is_enabled
            FROM items
            LEFT JOIN sources ON sources.id = items.source_id
            WHERE items.id = $id
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$id", id);
        CatalogPlaybackItem? item;
        using (var reader = command.ExecuteReader())
        {
            if (!reader.Read())
            {
                item = null;
            }
            else
            {
                item = new CatalogPlaybackItem
                {
                    Id = reader.GetString(0),
                    FullPath = reader.GetString(1),
                    FileName = reader.GetString(2),
                    MediaType = reader.GetInt32(3),
                    DurationTicks = reader.IsDBNull(4) ? null : reader.GetInt64(4),
                    IsFavorite = reader.GetInt32(5) != 0,
                    IsBlacklisted = reader.GetInt32(6) != 0,
                    IsSourceEnabled = reader.IsDBNull(7) || reader.GetInt32(7) != 0
                };
            }
        }

        transaction.Rollback();
        return item;
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

    public bool SetLoudness(string id, bool? hasAudio, double? integratedLoudness, double? peakDb, string? loudnessError)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                UPDATE items
                SET has_audio = $audio, integrated_loudness = $loudness, peak_db = $peak, loudness_error = $error
                WHERE id = $id;
                """,
                ("$id", id),
                ("$audio", hasAudio switch { true => 1, false => 0, _ => DBNull.Value }),
                ("$loudness", (object?)integratedLoudness ?? DBNull.Value),
                ("$peak", (object?)peakDb ?? DBNull.Value),
                ("$error", (object?)loudnessError ?? DBNull.Value)) > 0);
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

    public CatalogTagEditorRead ReadTagEditor(IReadOnlyList<string>? identifiers)
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

        var items = new List<CatalogItemTagRead>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var identifier in identifiers ?? [])
        {
            if (string.IsNullOrWhiteSpace(identifier) || !seen.Add(identifier.Trim()))
            {
                continue;
            }

            var requested = identifier.Trim();
            var itemId = ResolveItemId(connection, transaction, requested);
            items.Add(new CatalogItemTagRead
            {
                ItemId = requested,
                Tags = itemId == null ? [] : ReadItemTagNames(connection, transaction, itemId)
            });
        }

        transaction.Rollback();
        return new CatalogTagEditorRead
        {
            Categories = categories,
            Tags = tags,
            Items = items
        };
    }

    public bool ApplyItemTagEdits(
        IReadOnlyList<string> identifiers,
        IReadOnlyList<string> addTags,
        IReadOnlyList<string> removeTags,
        out bool catalogChanged)
    {
        catalogChanged = false;
        var ids = identifiers
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var adds = DistinctTagNames(addTags);
        var removes = DistinctTagNames(removeTags);
        if (ids.Count == 0 || (adds.Count == 0 && removes.Count == 0))
        {
            return false;
        }

        var insertedCatalog = false;
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

            foreach (var identifier in ids)
            {
                var itemId = ResolveItemId(connection, transaction, identifier);
                if (itemId == null)
                {
                    continue;
                }

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
        return committed;
    }

    public CatalogAutoTagApplyResult ApplyAutoTagAssignments(IReadOnlyList<CatalogAutoTagAssignment> assignments)
    {
        var added = 0;
        var paths = new List<string>();
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
                var changedPaths = new List<string>();
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
                    added++;
                    var path = itemPath.Trim();
                    changedPaths.Add(path);
                    paths.Add(path);
                }

                if (changedPaths.Count > 0)
                {
                    applied.Add(new CatalogAutoTagAppliedAssignment
                    {
                        TagName = tagName,
                        ChangedItemPaths = changedPaths
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
            AssignmentsAdded = added,
            ChangedItemPaths = paths.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
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

    private static string? ResolveItemId(SqliteConnection connection, SqliteTransaction transaction, string identifier)
    {
        var byId = ScalarString(
            connection,
            transaction,
            "SELECT id FROM items WHERE id = $id COLLATE NOCASE LIMIT 1;",
            ("$id", identifier.Trim()));
        if (byId != null)
        {
            return byId;
        }

        return ResolveItemByPath(connection, transaction, identifier);
    }

    private static string? ResolveItemByPath(SqliteConnection connection, SqliteTransaction transaction, string fullPath)
    {
        return ScalarString(
            connection,
            transaction,
            "SELECT id FROM items WHERE full_path_fold = $fold ORDER BY position LIMIT 1;",
            ("$fold", LibraryCatalogStore.Fold(fullPath.Trim())));
    }

    private static CatalogItemState? ReadItemState(SqliteConnection connection, SqliteTransaction transaction, string identifier)
    {
        var id = ResolveItemId(connection, transaction, identifier);
        if (id == null)
        {
            return null;
        }

        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT id, full_path, is_favorite, is_blacklisted, play_count, last_played_utc
            FROM items
            WHERE id = $id
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$id", id);
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
            LastPlayedUtc = LibraryCatalogStore.ReadUtc(reader, 5)
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
        command.CommandText = $"SELECT COUNT(*) {LibraryCatalogListSql.FromClause} {where};";
        args.Bind(command);
        var value = command.ExecuteScalar();
        return value is long count ? (int)count : Convert.ToInt32(value, CultureInfo.InvariantCulture);
    }

    private static List<CatalogAutoTagScanItem> ReadAutoTagItemsByPaths(SqliteConnection connection, IReadOnlyList<string>? paths)
    {
        var folds = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var path in paths ?? [])
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                continue;
            }

            var fold = LibraryCatalogStore.Fold(path);
            if (seen.Add(fold))
            {
                folds.Add(fold);
            }
        }

        var rows = new List<(int Position, CatalogAutoTagScanItem Item)>();
        for (var offset = 0; offset < folds.Count; offset += ItemStatePathChunk)
        {
            var count = Math.Min(ItemStatePathChunk, folds.Count - offset);
            using var command = connection.CreateCommand();
            var parameters = new string[count];
            for (var index = 0; index < count; index++)
            {
                var name = "$p" + index.ToString(CultureInfo.InvariantCulture);
                parameters[index] = name;
                command.Parameters.AddWithValue(name, folds[offset + index]);
            }

            command.CommandText = $"""
                SELECT id, full_path, relative_path, file_name, position
                FROM items
                WHERE full_path_fold IN ({string.Join(", ", parameters)});
                """;
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                rows.Add((reader.GetInt32(4), ReadAutoTagItem(reader)));
            }
        }

        rows.Sort((left, right) => left.Position.CompareTo(right.Position));
        return rows.Select(row => row.Item).ToList();
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
        return ReadTagGroups(command);
    }

    private static Dictionary<string, List<string>> ReadTagsForItems(SqliteConnection connection, IReadOnlyList<string> itemIds)
    {
        var tags = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        for (var offset = 0; offset < itemIds.Count; offset += ItemStatePathChunk)
        {
            var count = Math.Min(ItemStatePathChunk, itemIds.Count - offset);
            using var command = connection.CreateCommand();
            var parameters = new string[count];
            for (var index = 0; index < count; index++)
            {
                var name = "$p" + index.ToString(CultureInfo.InvariantCulture);
                parameters[index] = name;
                command.Parameters.AddWithValue(name, itemIds[offset + index]);
            }

            command.CommandText = $"""
                SELECT item_id, name
                FROM item_tags
                WHERE item_id IN ({string.Join(", ", parameters)})
                ORDER BY item_id, position;
                """;
            foreach (var pair in ReadTagGroups(command))
            {
                tags[pair.Key] = pair.Value;
            }
        }

        return tags;
    }

    private static Dictionary<string, List<string>> ReadTagGroups(SqliteCommand command)
    {
        var tags = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var itemId = reader.GetString(0);
            if (!tags.TryGetValue(itemId, out var names))
            {
                names = [];
                tags[itemId] = names;
            }

            names.Add(reader.GetString(1));
        }

        return tags;
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
            ThumbnailHeight = reader.IsDBNull(27) ? null : reader.GetInt32(27)
        };
    }

    private static void AttachTags(SqliteConnection connection, List<LibraryCatalogItem> items)
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
        var tagsByItem = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                var itemId = reader.GetString(0);
                if (!tagsByItem.TryGetValue(itemId, out var namesForItem))
                {
                    namesForItem = [];
                    tagsByItem[itemId] = namesForItem;
                }

                namesForItem.Add(reader.GetString(1));
            }
        }

        for (var i = 0; i < items.Count; i++)
        {
            if (!tagsByItem.TryGetValue(items[i].Id, out var tags))
            {
                continue;
            }

            items[i] = CopyWithTags(items[i], tags);
        }
    }

    internal static LibraryCatalogItem CopyWithTags(LibraryCatalogItem item, IReadOnlyList<string> tags)
    {
        return new LibraryCatalogItem
        {
            Id = item.Id,
            SourceId = item.SourceId,
            FullPath = item.FullPath,
            FullPathFold = item.FullPathFold,
            RelativePath = item.RelativePath,
            RelativePathFold = item.RelativePathFold,
            FileName = item.FileName,
            FileNameFold = item.FileNameFold,
            DurationTicks = item.DurationTicks,
            HasAudio = item.HasAudio,
            IntegratedLoudness = item.IntegratedLoudness,
            PeakDb = item.PeakDb,
            IsFavorite = item.IsFavorite,
            IsBlacklisted = item.IsBlacklisted,
            PlayCount = item.PlayCount,
            LastPlayedUtc = item.LastPlayedUtc,
            MediaType = item.MediaType,
            Fingerprint = item.Fingerprint,
            FingerprintAlgorithm = item.FingerprintAlgorithm,
            FingerprintVersion = item.FingerprintVersion,
            FileSizeBytes = item.FileSizeBytes,
            LastWriteTimeUtc = item.LastWriteTimeUtc,
            FingerprintLastUtc = item.FingerprintLastUtc,
            FingerprintStatus = item.FingerprintStatus,
            LoudnessError = item.LoudnessError,
            ThumbnailRevision = item.ThumbnailRevision,
            ThumbnailWidth = item.ThumbnailWidth,
            ThumbnailHeight = item.ThumbnailHeight,
            Tags = tags
        };
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

        if (item.LastWriteTimeUtc is DateTime written)
        {
            node["lastWriteTimeUtc"] = FormatUtc(written);
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

    private static CatalogGlobalStats ReadGlobalStats(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = $"""
            WITH flagged AS (
            {FlaggedItemsSql()}
            )
            SELECT
              COUNT(*) AS total_media,
              COALESCE(SUM(is_video), 0) AS total_videos,
              COALESCE(SUM(1 - is_video), 0) AS total_photos,
              COALESCE(SUM(CASE WHEN is_favorite != 0 THEN 1 ELSE 0 END), 0) AS favorites,
              COALESCE(SUM(CASE WHEN is_blacklisted != 0 THEN 1 ELSE 0 END), 0) AS blacklisted,
              COALESCE(SUM(CASE WHEN is_video = 1 AND play_count > 0 THEN 1 ELSE 0 END), 0) AS unique_played_videos,
              COALESCE(SUM(CASE WHEN is_video = 0 AND play_count > 0 THEN 1 ELSE 0 END), 0) AS unique_played_photos,
              COALESCE(SUM(CASE WHEN play_count > 0 THEN 1 ELSE 0 END), 0) AS unique_played_media,
              COALESCE(SUM(CASE WHEN play_count > 0 THEN play_count ELSE 0 END), 0) AS total_plays,
              COALESCE(SUM(CASE WHEN is_video = 1 AND has_audio IS NOT NULL AND has_audio != 0 THEN 1 ELSE 0 END), 0) AS videos_with_audio,
              COALESCE(SUM(CASE WHEN is_video = 1 AND has_audio IS NOT NULL AND has_audio = 0 THEN 1 ELSE 0 END), 0) AS videos_without_audio
            FROM flagged;
            """;
        int totalVideos;
        int totalPhotos;
        int totalMedia;
        int favorites;
        int blacklisted;
        int uniquePlayedVideos;
        int uniquePlayedPhotos;
        int uniquePlayedMedia;
        int totalPlays;
        int videosWithAudio;
        int videosWithoutAudio;
        using (var reader = command.ExecuteReader())
        {
            reader.Read();
            totalVideos = ReadCount(reader, 1);
            totalPhotos = ReadCount(reader, 2);
            totalMedia = ReadCount(reader, 0);
            favorites = ReadCount(reader, 3);
            blacklisted = ReadCount(reader, 4);
            uniquePlayedVideos = ReadCount(reader, 5);
            uniquePlayedPhotos = ReadCount(reader, 6);
            uniquePlayedMedia = ReadCount(reader, 7);
            totalPlays = ReadCount(reader, 8);
            videosWithAudio = ReadCount(reader, 9);
            videosWithoutAudio = ReadCount(reader, 10);
        }

        return new CatalogGlobalStats
        {
            TotalVideos = totalVideos,
            TotalPhotos = totalPhotos,
            TotalMedia = totalMedia,
            Favorites = favorites,
            Blacklisted = blacklisted,
            UniquePlayedVideos = uniquePlayedVideos,
            UniquePlayedPhotos = uniquePlayedPhotos,
            UniquePlayedMedia = uniquePlayedMedia,
            NeverPlayedVideos = Math.Max(0, totalVideos - uniquePlayedVideos),
            NeverPlayedPhotos = Math.Max(0, totalPhotos - uniquePlayedPhotos),
            NeverPlayedMedia = Math.Max(0, totalMedia - uniquePlayedMedia),
            TotalPlays = totalPlays,
            VideosWithAudio = videosWithAudio,
            VideosWithoutAudio = videosWithoutAudio,
            BaselineLoudnessLufs = ReadBaselineLoudness(connection)
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

    private static List<CatalogSourceStats> ReadSourceStats(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = $"""
            WITH flagged AS (
            {FlaggedItemsSql()}
            )
            SELECT
              sources.id,
              sources.root_path,
              sources.display_name,
              sources.is_enabled,
              COUNT(flagged.id) AS total_media,
              COALESCE(SUM(CASE WHEN flagged.id IS NOT NULL THEN flagged.is_video ELSE 0 END), 0) AS total_videos,
              COALESCE(SUM(CASE WHEN flagged.id IS NOT NULL THEN 1 - flagged.is_video ELSE 0 END), 0) AS total_photos,
              COALESCE(SUM(CASE WHEN flagged.is_video = 1 AND flagged.has_audio IS NOT NULL AND flagged.has_audio != 0 THEN 1 ELSE 0 END), 0) AS videos_with_audio,
              COALESCE(SUM(CASE WHEN flagged.is_video = 1 AND flagged.has_audio IS NOT NULL AND flagged.has_audio = 0 THEN 1 ELSE 0 END), 0) AS videos_without_audio,
              COALESCE(SUM(CASE WHEN flagged.is_video = 1 AND flagged.whole_seconds IS NOT NULL THEN flagged.whole_seconds ELSE 0 END), 0) AS duration_seconds,
              COALESCE(SUM(CASE WHEN flagged.is_video = 1 AND flagged.whole_seconds IS NOT NULL THEN 1 ELSE 0 END), 0) AS duration_count
            FROM sources
            LEFT JOIN flagged ON {ItemBelongsToSourceSql()}
            WHERE TRIM(sources.id) != ''
            GROUP BY sources.position, sources.id, sources.root_path, sources.display_name, sources.is_enabled
            ORDER BY sources.position;
            """;
        using var reader = command.ExecuteReader();
        var sources = new List<CatalogSourceStats>();
        while (reader.Read())
        {
            var durationSeconds = reader.GetInt64(9);
            var durationCount = reader.GetInt64(10);
            var totalVideos = ReadCount(reader, 5);
            var totalPhotos = ReadCount(reader, 6);
            sources.Add(new CatalogSourceStats
            {
                SourceId = reader.GetString(0),
                RootPath = reader.GetString(1),
                DisplayName = reader.IsDBNull(2) ? null : reader.GetString(2),
                IsEnabled = reader.GetInt64(3) != 0,
                TotalVideos = totalVideos,
                TotalPhotos = totalPhotos,
                TotalMedia = ReadCount(reader, 4),
                VideosWithAudio = ReadCount(reader, 7),
                VideosWithoutAudio = ReadCount(reader, 8),
                TotalDurationSeconds = durationSeconds,
                AverageDurationSeconds = AverageDurationSeconds(durationSeconds, durationCount)
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

    private static int ReadCount(SqliteDataReader reader, int ordinal) =>
        Convert.ToInt32(reader.GetInt64(ordinal), CultureInfo.InvariantCulture);

    private static string FlaggedItemsSql()
    {
        var ticks = TimeSpan.TicksPerSecond.ToString(CultureInfo.InvariantCulture);
        return $"""
            SELECT
              items.id,
              items.source_id,
              items.full_path,
              items.has_audio,
              items.is_favorite,
              items.is_blacklisted,
              items.play_count,
              {IsVideoSql("items")} AS is_video,
              CASE
                WHEN items.duration_ticks IS NULL THEN NULL
                ELSE (CASE WHEN items.duration_ticks < 0 THEN 0 ELSE items.duration_ticks END) / {ticks}
              END AS whole_seconds
            FROM items
            """;
    }

    private static string IsVideoSql(string itemAlias)
    {
        var path = $"{itemAlias}.full_path";
        var media = $"{itemAlias}.media_type";
        var slashPath = $"REPLACE({path}, '\\', '/')";
        var fileName = $"""
            CASE
              WHEN INSTR({slashPath}, '/') = 0 THEN {slashPath}
              ELSE REPLACE({slashPath}, RTRIM({slashPath}, REPLACE({slashPath}, '/', '')), '')
            END
            """;
        var extension = $"""
            CASE
              WHEN INSTR({fileName}, '.') = 0 THEN ''
              ELSE '.' || LOWER(REPLACE({fileName}, RTRIM({fileName}, REPLACE({fileName}, '.', '')), ''))
            END
            """;
        return $"""
            (CASE
              WHEN {media} = {(int)MediaTypeValue.Photo} THEN 0
              WHEN {media} = {(int)MediaTypeValue.Video} THEN 1
              WHEN {extension} IN ({PhotoExtensionsSql}) THEN 0
              ELSE 1
            END)
            """;
    }

    private static string ItemBelongsToSourceSql()
    {
        const string itemPath = "RTRIM(REPLACE(flagged.full_path, '\\', '/'), '/')";
        const string rootPath = "RTRIM(REPLACE(sources.root_path, '\\', '/'), '/')";
        return $"""
            (
              TRIM(flagged.source_id) != ''
              AND flagged.source_id = sources.id COLLATE NOCASE
            )
            OR
            (
              TRIM(flagged.source_id) = ''
              AND {rootPath} != ''
              AND (
                LOWER({itemPath}) = LOWER({rootPath})
                OR INSTR(LOWER({itemPath}), LOWER({rootPath}) || '/') = 1
              )
            )
            """;
    }

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
}

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
    public int UniquePlayedVideos { get; init; }
    public int UniquePlayedPhotos { get; init; }
    public int UniquePlayedMedia { get; init; }
    public int NeverPlayedVideos { get; init; }
    public int NeverPlayedPhotos { get; init; }
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
}

public enum CatalogAutoTagScanScope
{
    All,
    EnabledSources,
    Paths
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
}

public sealed class CatalogAutoTagAssignment
{
    public string TagName { get; init; } = string.Empty;
    public IReadOnlyList<string> ItemPaths { get; init; } = [];
}

public sealed class CatalogAutoTagAppliedAssignment
{
    public string TagName { get; init; } = string.Empty;
    public List<string> ChangedItemPaths { get; init; } = [];
}

public sealed class CatalogAutoTagApplyResult
{
    public int AssignmentsAdded { get; init; }
    public List<string> ChangedItemPaths { get; init; } = [];
    public List<CatalogAutoTagAppliedAssignment> Applied { get; init; } = [];
}

public readonly record struct CatalogSourceImportFile(string FullPath, string RelativePath, string FileName, int MediaType);

public sealed class CatalogSourceImportResult
{
    public string SourceId { get; init; } = string.Empty;
    public int ImportedCount { get; init; }
    public int UpdatedCount { get; init; }
}

