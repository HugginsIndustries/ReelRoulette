using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;

namespace ReelRoulette.Core.Library;

public sealed class LibraryCatalogSession
{
    private readonly string _databasePath;
    private readonly AsyncLocal<WriteScope?> _writeScope = new();

    public LibraryCatalogSession(string databasePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(databasePath);
        _databasePath = databasePath;
    }

    public string DatabasePath => _databasePath;

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

    public JsonObject BuildDocument()
    {
        var catalog = LibraryCatalogStore.Read(_databasePath);
        var root = new JsonObject
        {
            ["sources"] = new JsonArray(catalog.Sources.Select(ToSource).ToArray()),
            ["items"] = new JsonArray(catalog.Items.Select(ToItem).ToArray()),
            ["categories"] = new JsonArray(catalog.Categories.Select(ToCategory).ToArray()),
            ["tags"] = new JsonArray(catalog.Tags.Select(ToTag).ToArray())
        };
        if (catalog.AvailableTagsPresent)
        {
            root["availableTags"] = new JsonArray(catalog.AvailableTags.Select(name => (JsonNode)name).ToArray());
        }

        return root;
    }

    public LibraryListResult QueryList(LibraryListRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        LibraryCatalogListSql.RegisterCollation(connection);

        var hasCategories = LibraryCatalogStore.ExecuteScalarInt(connection, "SELECT COUNT(*) FROM categories;") > 0;
        var catalogTags = hasCategories ? ReadCatalogTags(connection) : [];
        var searchArgs = new LibraryCatalogListSql.SqlArgs();
        var searchWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: false, hasCategories, catalogTags, searchArgs);
        var searchBaselineCount = ScalarCount(connection, searchWhere, searchArgs);

        var filterArgs = new LibraryCatalogListSql.SqlArgs();
        var filterWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, hasCategories, catalogTags, filterArgs);
        var totalCount = ScalarCount(connection, filterWhere, filterArgs);

        var pageArgs = new LibraryCatalogListSql.SqlArgs();
        var pageWhere = LibraryCatalogListSql.BuildWhere(request, includeFilter: true, hasCategories, catalogTags, pageArgs);
        var orderBy = LibraryCatalogListSql.BuildOrderBy(request);
        var limit = pageArgs.Add(request.Limit);
        var offset = pageArgs.Add(request.Offset);
        using var command = connection.CreateCommand();
        command.CommandText = $"""
            SELECT items.id, items.source_id, items.full_path, items.full_path_fold, items.relative_path, items.relative_path_fold,
                   items.file_name, items.file_name_fold, items.duration_ticks, items.has_audio, items.integrated_loudness, items.peak_db,
                   items.is_favorite, items.is_blacklisted, items.play_count, items.last_played_utc, items.media_type, items.fingerprint,
                   items.fingerprint_algorithm, items.fingerprint_version, items.file_size_bytes, items.last_write_time_utc,
                   items.fingerprint_last_utc, items.fingerprint_status, items.loudness_error
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

    public static JsonObject ToItemJson(LibraryCatalogItem item) => ToItem(item);

    public void RunInTransaction(Action work)
    {
        ArgumentNullException.ThrowIfNull(work);
        if (_writeScope.Value != null)
        {
            work();
            return;
        }

        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var transaction = connection.BeginTransaction();
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

    public bool DeleteItem(string id)
    {
        return Commit((connection, transaction) =>
        {
            LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM item_tags WHERE item_id = $id;", ("$id", id));
            return LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM items WHERE id = $id;", ("$id", id)) > 0;
        });
    }

    public bool SetFavorite(string id, bool isFavorite)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                UPDATE items
                SET is_favorite = $favorite,
                    is_blacklisted = CASE WHEN $favorite = 1 THEN 0 ELSE is_blacklisted END
                WHERE id = $id;
                """,
                ("$id", id),
                ("$favorite", isFavorite ? 1 : 0)) > 0);
    }

    public bool SetBlacklist(string id, bool isBlacklisted)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                """
                UPDATE items
                SET is_blacklisted = $blacklisted,
                    is_favorite = CASE WHEN $blacklisted = 1 THEN 0 ELSE is_favorite END
                WHERE id = $id;
                """,
                ("$id", id),
                ("$blacklisted", isBlacklisted ? 1 : 0)) > 0);
    }

    public bool SetPlayback(string id, int playCount, DateTime? lastPlayedUtc)
    {
        return Commit((connection, transaction) =>
            LibraryCatalogStore.Execute(
                connection,
                transaction,
                "UPDATE items SET play_count = $plays, last_played_utc = $played WHERE id = $id;",
                ("$id", id),
                ("$plays", playCount),
                ("$played", lastPlayedUtc is null ? DBNull.Value : lastPlayedUtc.Value.ToUniversalTime().Ticks)) > 0);
    }

    public bool ClearPlaybackStats(IReadOnlyCollection<string>? itemIds)
    {
        var ids = (itemIds ?? []).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.Ordinal).ToArray();
        return Commit((connection, transaction) =>
        {
            if (ids.Length == 0)
            {
                return LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "UPDATE items SET play_count = 0, last_played_utc = NULL WHERE play_count != 0 OR last_played_utc IS NOT NULL;") > 0;
            }

            var changed = false;
            foreach (var id in ids)
            {
                changed |= LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "UPDATE items SET play_count = 0, last_played_utc = NULL WHERE id = $id AND (play_count != 0 OR last_played_utc IS NOT NULL);",
                    ("$id", id)) > 0;
            }

            return changed;
        });
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
        if (string.IsNullOrWhiteSpace(oldName) || string.IsNullOrWhiteSpace(newName))
        {
            return false;
        }

        var trimmed = newName.Trim();
        var oldFold = LibraryCatalogStore.Fold(oldName.Trim());
        var newFold = LibraryCatalogStore.Fold(trimmed);
        return Commit((connection, transaction) =>
        {
            var sourceRows = ReadTagsByFold(connection, transaction, oldFold);
            if (sourceRows.Count == 0)
            {
                return false;
            }

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
    }

    public bool DeleteTag(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var fold = LibraryCatalogStore.Fold(name.Trim());
        return Commit((connection, transaction) =>
        {
            var removed = LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM tags WHERE name_fold = $fold;", ("$fold", fold)) > 0;
            removed |= LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM item_tags WHERE name_fold = $fold;", ("$fold", fold)) > 0;
            return removed;
        });
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

    public bool ReplaceTagCatalog(IReadOnlyList<LibraryCatalogCategory> categories, IReadOnlyList<LibraryCatalogTag> tags)
    {
        return Commit((connection, transaction) =>
        {
            LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM categories;");
            LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM tags;");
            var position = 0;
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var category in categories)
            {
                if (string.IsNullOrWhiteSpace(category.Name))
                {
                    continue;
                }

                var id = LibraryCatalogStore.NormalizeCategoryId(category.Id);
                if (!seen.Add(id))
                {
                    continue;
                }

                LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "INSERT INTO categories (id, position, name, sort_order) VALUES ($id, $position, $name, $sort);",
                    ("$id", id),
                    ("$position", position),
                    ("$name", category.Name.Trim()),
                    ("$sort", category.SortOrder));
                position++;
            }

            EnsureUncategorized(connection, transaction);
            var keptTags = new List<LibraryCatalogTag>();
            var indexByFold = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (var tag in tags)
            {
                if (string.IsNullOrWhiteSpace(tag.Name))
                {
                    continue;
                }

                var trimmed = tag.Name.Trim();
                var fold = LibraryCatalogStore.Fold(trimmed);
                var category = LibraryCatalogStore.NormalizeCategoryId(tag.CategoryId);
                if (!indexByFold.TryGetValue(fold, out var index))
                {
                    indexByFold[fold] = keptTags.Count;
                    keptTags.Add(new LibraryCatalogTag { Name = trimmed, CategoryId = category });
                    continue;
                }

                var kept = keptTags[index];
                var keptUncategorized = string.Equals(kept.CategoryId, LibraryCatalogStore.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase);
                var candidateUncategorized = string.Equals(category, LibraryCatalogStore.UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase);
                if (keptUncategorized && !candidateUncategorized)
                {
                    keptTags[index] = new LibraryCatalogTag { Name = trimmed, CategoryId = category };
                }
            }

            for (var tagPosition = 0; tagPosition < keptTags.Count; tagPosition++)
            {
                var tag = keptTags[tagPosition];
                LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "INSERT INTO tags (position, name, name_fold, category_id) VALUES ($position, $name, $fold, $category);",
                    ("$position", tagPosition),
                    ("$name", tag.Name),
                    ("$fold", LibraryCatalogStore.Fold(tag.Name)),
                    ("$category", tag.CategoryId));
            }

            return true;
        });
    }

    public bool AddItemTags(string itemId, IReadOnlyList<string> tags)
    {
        var names = DistinctTagNames(tags);
        if (names.Count == 0)
        {
            return false;
        }

        return Commit((connection, transaction) =>
        {
            if (!ItemExists(connection, transaction, itemId))
            {
                return false;
            }

            var changed = false;
            foreach (var name in names)
            {
                changed |= InsertCatalogTagIfMissing(connection, transaction, name);
                var fold = LibraryCatalogStore.Fold(name);
                var existing = ScalarInt(
                    connection,
                    transaction,
                    "SELECT position FROM item_tags WHERE item_id = $item AND name_fold = $fold;",
                    ("$item", itemId),
                    ("$fold", fold));
                if (existing != null)
                {
                    continue;
                }

                var position = NextItemTagPosition(connection, transaction, itemId);
                changed |= LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "INSERT INTO item_tags (item_id, position, name, name_fold) VALUES ($item, $position, $name, $fold);",
                    ("$item", itemId),
                    ("$position", position),
                    ("$name", name),
                    ("$fold", fold)) > 0;
            }

            return changed;
        });
    }

    public bool RemoveItemTags(string itemId, IReadOnlyList<string> tags)
    {
        var names = DistinctTagNames(tags);
        if (names.Count == 0)
        {
            return false;
        }

        return Commit((connection, transaction) =>
        {
            var changed = false;
            foreach (var name in names)
            {
                changed |= LibraryCatalogStore.Execute(
                    connection,
                    transaction,
                    "DELETE FROM item_tags WHERE item_id = $item AND name_fold = $fold;",
                    ("$item", itemId),
                    ("$fold", LibraryCatalogStore.Fold(name))) > 0;
            }

            return changed;
        });
    }

    public bool ReplaceItemTags(string itemId, IReadOnlyList<string> tags)
    {
        var names = DistinctTagNames(tags);
        return Commit((connection, transaction) =>
        {
            if (!ItemExists(connection, transaction, itemId))
            {
                return false;
            }

            LibraryCatalogStore.Execute(connection, transaction, "DELETE FROM item_tags WHERE item_id = $item;", ("$item", itemId));
            WriteItemTags(connection, transaction, itemId, names);
            return true;
        });
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

        using var connection = LibraryCatalogStore.OpenWrite(_databasePath);
        using var transaction = connection.BeginTransaction();
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
        return true;
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

    private static bool ItemExists(SqliteConnection connection, SqliteTransaction transaction, string itemId)
    {
        return ScalarString(connection, transaction, "SELECT id FROM items WHERE id = $id;", ("$id", itemId)) != null;
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
            LoudnessError = reader.IsDBNull(24) ? null : reader.GetString(24)
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

    private static LibraryCatalogItem CopyWithTags(LibraryCatalogItem item, IReadOnlyList<string> tags)
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
            Tags = tags
        };
    }

    private static JsonObject ToSource(LibraryCatalogSource source)
    {
        var node = new JsonObject
        {
            ["id"] = source.Id,
            ["rootPath"] = source.RootPath,
            ["isEnabled"] = source.IsEnabled
        };
        if (source.DisplayName != null)
        {
            node["displayName"] = source.DisplayName;
        }

        return node;
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

    private static JsonObject ToCategory(LibraryCatalogCategory category)
    {
        return new JsonObject
        {
            ["id"] = category.Id,
            ["name"] = category.Name,
            ["sortOrder"] = category.SortOrder
        };
    }

    private static JsonObject ToTag(LibraryCatalogTag tag)
    {
        return new JsonObject
        {
            ["name"] = tag.Name,
            ["categoryId"] = tag.CategoryId
        };
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

    private static string FormatUtc(DateTime value)
    {
        var utc = value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        return utc.ToString("o", CultureInfo.InvariantCulture);
    }
}
