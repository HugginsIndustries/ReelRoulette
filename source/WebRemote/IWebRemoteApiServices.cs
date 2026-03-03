using System.Collections.Generic;
using ReelRoulette;

namespace ReelRoulette.WebRemote
{
    /// <summary>
    /// Services required by the web remote API to perform random selection and streaming.
    /// Implemented by MainWindow and passed to WebRemoteServer.
    /// </summary>
    public interface IWebRemoteApiServices
    {
        /// <summary>
        /// Gets the library index.
        /// </summary>
        LibraryIndex? GetLibraryIndex();

        /// <summary>
        /// Gets the filter service.
        /// </summary>
        FilterService GetFilterService();

        /// <summary>
        /// Gets the list of filter presets (name -> FilterState).
        /// </summary>
        IReadOnlyList<FilterPreset> GetFilterPresets();

        /// <summary>
        /// Finds a preset by name (case-insensitive).
        /// </summary>
        FilterPreset? GetPresetByName(string presetName);

        /// <summary>
        /// Resolves an item ID (FullPath) to a LibraryItem.
        /// </summary>
        LibraryItem? GetItemByPath(string fullPath);

        /// <summary>
        /// Sets the favorite state for an item. Returns true if updated.
        /// </summary>
        bool SetItemFavorite(string fullPath, bool isFavorite);

        /// <summary>
        /// Sets the blacklist state for an item. Returns true if updated.
        /// </summary>
        bool SetItemBlacklist(string fullPath, bool isBlacklisted);

        /// <summary>
        /// Records a playback event for a path and updates play stats.
        /// </summary>
        bool RecordPlayback(string fullPath);

        /// <summary>
        /// Gets tag editor model snapshot for the requested item IDs.
        /// </summary>
        CoreTagEditorModelResponse? GetTagEditorModel(IReadOnlyList<string> itemIds);

        /// <summary>
        /// Applies add/remove tag deltas to one or more items.
        /// </summary>
        bool ApplyItemTags(IReadOnlyList<string> itemIds, IReadOnlyList<string> addTags, IReadOnlyList<string> removeTags);

        /// <summary>
        /// Creates or updates a category.
        /// </summary>
        bool UpsertCategory(TagCategory category);

        /// <summary>
        /// Creates or updates a tag.
        /// </summary>
        bool UpsertTag(string tagName, string categoryId);

        /// <summary>
        /// Renames a tag and optionally moves category.
        /// </summary>
        bool RenameTag(string oldTagName, string newTagName, string? newCategoryId);

        /// <summary>
        /// Deletes a tag.
        /// </summary>
        bool DeleteTag(string tagName);

        /// <summary>
        /// Deletes a category and optionally reassigns its tags.
        /// </summary>
        bool DeleteCategory(string categoryId, string? newCategoryId);
    }
}
