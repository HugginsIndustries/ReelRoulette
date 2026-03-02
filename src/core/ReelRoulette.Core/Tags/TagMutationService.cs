namespace ReelRoulette.Core.Tags;

public sealed class TagMutationService
{
    public void RenameTag(CoreLibraryIndex index, string oldName, string newName, string? newCategoryId = null)
    {
        ArgumentNullException.ThrowIfNull(index);

        if (index.Tags != null)
        {
            var tag = index.Tags.FirstOrDefault(t =>
                string.Equals(t.Name, oldName, StringComparison.OrdinalIgnoreCase));

            if (tag != null)
            {
                tag.Name = newName;
                if (newCategoryId != null)
                    tag.CategoryId = newCategoryId;
            }
        }

        foreach (var item in index.Items)
        {
            var tagIndex = item.Tags.FindIndex(t =>
                string.Equals(t, oldName, StringComparison.OrdinalIgnoreCase));
            if (tagIndex >= 0)
                item.Tags[tagIndex] = newName;
        }
    }

    public void DeleteCategory(CoreLibraryIndex index, string categoryId, string? newCategoryId = null)
    {
        ArgumentNullException.ThrowIfNull(index);

        if (index.Categories != null)
            index.Categories.RemoveAll(c => c.Id == categoryId);

        if (index.Tags == null)
            return;

        if (newCategoryId != null)
        {
            var tagsToReassign = index.Tags.Where(t => t.CategoryId == categoryId).ToList();
            foreach (var tag in tagsToReassign)
                tag.CategoryId = newCategoryId;
            return;
        }

        var tagsToDelete = index.Tags.Where(t => t.CategoryId == categoryId).ToList();
        var tagNamesSet = new HashSet<string>(
            tagsToDelete.Select(t => t.Name),
            StringComparer.OrdinalIgnoreCase);

        index.Tags.RemoveAll(t => t.CategoryId == categoryId);

        foreach (var item in index.Items)
            item.Tags.RemoveAll(t => tagNamesSet.Contains(t));
    }

    public void DeleteTag(CoreLibraryIndex index, string tagName)
    {
        ArgumentNullException.ThrowIfNull(index);

        if (index.Tags != null)
        {
            index.Tags.RemoveAll(t =>
                string.Equals(t.Name, tagName, StringComparison.OrdinalIgnoreCase));
        }

        foreach (var item in index.Items)
        {
            item.Tags.RemoveAll(t =>
                string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase));
        }
    }

    public int UpdateFilterPresetsForRenamedTag(List<CoreFilterPreset>? presets, string oldName, string newName)
    {
        if (presets == null || presets.Count == 0)
            return 0;

        var presetsUpdated = 0;
        foreach (var preset in presets)
        {
            var presetModified = false;

            for (var i = 0; i < preset.FilterState.SelectedTags.Count; i++)
            {
                if (string.Equals(preset.FilterState.SelectedTags[i], oldName, StringComparison.OrdinalIgnoreCase))
                {
                    preset.FilterState.SelectedTags[i] = newName;
                    presetModified = true;
                }
            }

            for (var i = 0; i < preset.FilterState.ExcludedTags.Count; i++)
            {
                if (string.Equals(preset.FilterState.ExcludedTags[i], oldName, StringComparison.OrdinalIgnoreCase))
                {
                    preset.FilterState.ExcludedTags[i] = newName;
                    presetModified = true;
                }
            }

            if (presetModified)
                presetsUpdated++;
        }

        return presetsUpdated;
    }

    public int UpdateFilterPresetsForDeletedTag(List<CoreFilterPreset>? presets, string tagName)
    {
        if (presets == null || presets.Count == 0)
            return 0;

        var presetsUpdated = 0;
        foreach (var preset in presets)
        {
            var presetModified = false;

            var selectedRemoved = preset.FilterState.SelectedTags.RemoveAll(t =>
                string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase));
            if (selectedRemoved > 0)
                presetModified = true;

            var excludedRemoved = preset.FilterState.ExcludedTags.RemoveAll(t =>
                string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase));
            if (excludedRemoved > 0)
                presetModified = true;

            if (presetModified)
                presetsUpdated++;
        }

        return presetsUpdated;
    }
}
