using System;
using System.Collections.Generic;
using System.Linq;

namespace ReelRoulette;

public enum TagEditorSaveKind
{
    DeleteCategory,
    UpsertCategory,
    DeleteTag,
    RenameTag,
    UpsertTag,
    ApplyItemTags,
    ApplyAutoTags
}

public sealed class TagEditorAutoTagAssignment
{
    public string TagName { get; init; } = string.Empty;
    public List<string> ItemPaths { get; init; } = [];
}

public sealed class TagEditorSaveStep
{
    public TagEditorSaveKind Kind { get; init; }
    public string? CategoryId { get; init; }
    public string? NewCategoryId { get; init; }
    public string? Name { get; init; }
    public int SortOrder { get; init; }
    public string? OldName { get; init; }
    public string? NewName { get; init; }
    public List<string> ItemIds { get; init; } = [];
    public List<string> AddTags { get; init; } = [];
    public List<string> RemoveTags { get; init; } = [];
    public List<TagEditorAutoTagAssignment> Assignments { get; init; } = [];
}

public sealed class TagEditorSave
{
    public List<TagEditorSaveStep> Steps { get; init; } = [];
}

public sealed class TagSaveItem
{
    public string Id { get; init; } = string.Empty;
    public string FullPath { get; init; } = string.Empty;
    public List<string> Tags { get; set; } = [];
}

public sealed class TagSaveEcho
{
    public List<string> ItemIds { get; init; } = [];
    public List<string> AddedTags { get; init; } = [];
    public List<string> RemovedTags { get; init; } = [];
    public bool MatchPathsAsSubset { get; init; }
    public bool MatchAsSuperset { get; init; }
}

public sealed class TagSaveAppliedTag
{
    public string TagName { get; init; } = string.Empty;
    public IReadOnlyList<string> ItemPaths { get; init; } = [];
}

public readonly record struct TagSaveEchoDecision(bool SkipPatch, bool Reload, bool ForceReload);

public readonly record struct IncomingTagHandling(bool HadTagFilter, bool ReloadBecauseFilterCleared);

public sealed class IncomingItemTagsEvent
{
    public List<string> AddedTags { get; init; } = [];
    public List<string> RemovedTags { get; init; } = [];
    public string? CatalogReplacedTag { get; init; }
    public string? CatalogReplacementTag { get; init; }
}

public readonly record struct TagUndo(string ItemId, IReadOnlyList<string> Remove, IReadOnlyList<string> Add);

public static class TagSaveApply
{
    public static List<TagSaveItem> Snapshot(IEnumerable<TagSaveItem> items)
    {
        return items.Select(item => new TagSaveItem
        {
            Id = item.Id,
            FullPath = item.FullPath,
            Tags = item.Tags.ToList()
        }).ToList();
    }

    public static void Restore(IList<TagSaveItem> items, IReadOnlyList<TagSaveItem> snapshot)
    {
        var byId = snapshot.ToDictionary(item => item.Id, item => item.Tags, StringComparer.OrdinalIgnoreCase);
        foreach (var item in items)
        {
            if (byId.TryGetValue(item.Id, out var tags))
            {
                item.Tags = tags.ToList();
            }
        }
    }

    public static void Apply(IList<TagSaveItem> items, IReadOnlyList<TagEditorSaveStep> steps)
    {
        _ = ApplyRecording(items, steps);
    }

    public static List<List<TagUndo>> ApplyRecording(IList<TagSaveItem> items, IReadOnlyList<TagEditorSaveStep> steps)
    {
        var recorded = new List<List<TagUndo>>(steps.Count);
        foreach (var step in steps)
        {
            var undos = new List<TagUndo>();
            switch (step.Kind)
            {
                case TagEditorSaveKind.RenameTag:
                    foreach (var item in items)
                    {
                        if (!ContainsTag(item.Tags, step.OldName))
                        {
                            continue;
                        }

                        var before = item.Tags.ToList();
                        item.Tags = Merge(Merge(item.Tags, [], [step.OldName ?? string.Empty]), [step.NewName ?? string.Empty], []);
                        RecordChange(undos, item, before);
                    }
                    break;
                case TagEditorSaveKind.DeleteTag:
                    foreach (var item in items)
                    {
                        if (!ContainsTag(item.Tags, step.Name))
                        {
                            continue;
                        }

                        var before = item.Tags.ToList();
                        item.Tags = Merge(item.Tags, [], [step.Name ?? string.Empty]);
                        RecordChange(undos, item, before);
                    }
                    break;
                case TagEditorSaveKind.ApplyItemTags:
                    foreach (var item in items.Where(item => step.ItemIds.Any(id => Matches(item, id))))
                    {
                        var before = item.Tags.ToList();
                        item.Tags = Merge(item.Tags, step.AddTags, step.RemoveTags);
                        RecordChange(undos, item, before);
                    }
                    break;
                case TagEditorSaveKind.ApplyAutoTags:
                    foreach (var assignment in step.Assignments)
                    {
                        foreach (var item in items.Where(item => assignment.ItemPaths.Any(path => Matches(item, path))))
                        {
                            var before = item.Tags.ToList();
                            item.Tags = Merge(item.Tags, [assignment.TagName], []);
                            RecordChange(undos, item, before);
                        }
                    }
                    break;
            }

            recorded.Add(undos);
        }

        return recorded;
    }

    public static void Undo(IList<TagSaveItem> items, IReadOnlyList<TagUndo> undos)
    {
        foreach (var undo in undos)
        {
            foreach (var item in items)
            {
                if (!string.Equals(item.Id, undo.ItemId, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                item.Tags = Merge(item.Tags, undo.Add, undo.Remove);
            }
        }
    }

    public static void HandleIncomingItemTags(
        IncomingItemTagsEvent incoming,
        Func<bool> tagFilterCanChangeMembership,
        Action<TagEditorSaveStep> retarget,
        Action<IncomingTagHandling> afterRetarget)
    {
        var hadTagFilter = tagFilterCanChangeMembership();
        var step = CatalogRetargetStep(incoming);
        if (step != null)
        {
            retarget(step);
        }

        var stillHasTagFilter = tagFilterCanChangeMembership();
        afterRetarget(new IncomingTagHandling(hadTagFilter, hadTagFilter && !stillHasTagFilter));
    }

    private static TagEditorSaveStep? CatalogRetargetStep(IncomingItemTagsEvent incoming)
    {
        if (string.IsNullOrWhiteSpace(incoming.CatalogReplacedTag))
        {
            return null;
        }

        var oldName = incoming.CatalogReplacedTag.Trim();
        if (string.IsNullOrWhiteSpace(incoming.CatalogReplacementTag))
        {
            return new TagEditorSaveStep
            {
                Kind = TagEditorSaveKind.DeleteTag,
                Name = oldName
            };
        }

        return new TagEditorSaveStep
        {
            Kind = TagEditorSaveKind.RenameTag,
            OldName = oldName,
            NewName = incoming.CatalogReplacementTag.Trim()
        };
    }

    public static bool RetargetFilterTags(IList<string>? tags, TagEditorSaveStep step)
    {
        if (tags == null)
        {
            return false;
        }

        if (step.Kind == TagEditorSaveKind.RenameTag)
        {
            return ReplaceFilterTag(tags, step.OldName, step.NewName);
        }

        if (step.Kind == TagEditorSaveKind.DeleteTag)
        {
            return RemoveFilterTag(tags, step.Name);
        }

        return false;
    }

    public static void Rollback(IList<TagSaveItem> items, IReadOnlyList<TagSaveItem> snapshot, IReadOnlyList<TagEditorSaveStep> accepted)
    {
        Restore(items, snapshot);
        Apply(items, accepted);
    }

    public static List<TagSaveEcho> EchoesFor(IReadOnlyList<TagEditorSaveStep> steps)
    {
        var echoes = new List<TagSaveEcho>();
        foreach (var step in steps)
        {
            if (step.Kind == TagEditorSaveKind.ApplyItemTags)
            {
                echoes.Add(new TagSaveEcho
                {
                    ItemIds = step.ItemIds.ToList(),
                    AddedTags = step.AddTags.ToList(),
                    RemovedTags = step.RemoveTags.ToList()
                });
                continue;
            }

            if (step.Kind != TagEditorSaveKind.ApplyAutoTags)
            {
                continue;
            }

            foreach (var assignment in step.Assignments)
            {
                if (string.IsNullOrWhiteSpace(assignment.TagName))
                {
                    continue;
                }

                var paths = new List<string>();
                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var path in assignment.ItemPaths)
                {
                    if (string.IsNullOrWhiteSpace(path))
                    {
                        continue;
                    }

                    var trimmed = path.Trim();
                    if (seen.Add(trimmed))
                    {
                        paths.Add(trimmed);
                    }
                }

                if (paths.Count == 0)
                {
                    continue;
                }

                echoes.Add(new TagSaveEcho
                {
                    ItemIds = paths,
                    AddedTags = [assignment.TagName.Trim()],
                    RemovedTags = [],
                    MatchPathsAsSubset = true
                });
            }
        }

        return echoes;
    }

    public static List<string> Merge(IReadOnlyList<string>? tags, IReadOnlyList<string> addTags, IReadOnlyList<string> removeTags)
    {
        var updated = (tags ?? [])
            .Where(tag => !removeTags.Contains(tag, StringComparer.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        foreach (var addTag in addTags)
        {
            if (string.IsNullOrWhiteSpace(addTag))
            {
                continue;
            }

            if (!updated.Contains(addTag, StringComparer.OrdinalIgnoreCase))
            {
                updated.Add(addTag.Trim());
            }
        }

        return updated;
    }

    private static void RecordChange(List<TagUndo> undos, TagSaveItem item, List<string> before)
    {
        var removed = before.Where(tag => !ContainsTag(item.Tags, tag)).ToList();
        var added = item.Tags.Where(tag => !ContainsTag(before, tag)).ToList();
        if (removed.Count == 0 && added.Count == 0)
        {
            return;
        }

        undos.Add(new TagUndo(item.Id, added, removed));
    }

    private static bool ReplaceFilterTag(IList<string> tags, string? oldName, string? newName)
    {
        if (string.IsNullOrWhiteSpace(oldName) || string.IsNullOrWhiteSpace(newName))
        {
            return false;
        }

        var next = newName.Trim();
        var changed = false;
        for (var i = 0; i < tags.Count; i++)
        {
            if (!string.Equals(tags[i], oldName, StringComparison.OrdinalIgnoreCase)
                || string.Equals(tags[i], next, StringComparison.Ordinal))
            {
                continue;
            }

            tags[i] = next;
            changed = true;
        }

        return changed;
    }

    private static bool RemoveFilterTag(IList<string> tags, string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var changed = false;
        for (var i = tags.Count - 1; i >= 0; i--)
        {
            if (!string.Equals(tags[i], name, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            tags.RemoveAt(i);
            changed = true;
        }

        return changed;
    }

    private static bool ContainsTag(IReadOnlyList<string> tags, string? name)
    {
        return !string.IsNullOrWhiteSpace(name) && tags.Contains(name, StringComparer.OrdinalIgnoreCase);
    }

    private static bool Matches(TagSaveItem item, string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return false;
        }

        return string.Equals(item.Id, identifier, StringComparison.OrdinalIgnoreCase)
            || string.Equals(item.FullPath, identifier, StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class TagSaveHandle
{
    internal TagSaveHandle(int id)
    {
        Id = id;
    }

    internal int Id { get; }
}

public sealed class TagSaveSession
{
    private readonly List<PendingSave> _saves = [];
    private List<TagSaveItem> _baseline = [];
    private int _nextId;

    public TagSaveHandle Begin(
        List<TagSaveItem> items,
        IReadOnlyList<TagEditorSaveStep> steps,
        bool forceReload,
        bool tagFilterCanChangeMembership = false)
    {
        if (_saves.Count == 0)
        {
            _baseline = TagSaveApply.Snapshot(items);
        }

        var undos = TagSaveApply.ApplyRecording(items, steps);
        var handle = new TagSaveHandle(++_nextId);
        _saves.Add(new PendingSave(
            handle,
            steps.ToList(),
            undos,
            BuildPendingEchoes(steps, undos),
            forceReload,
            tagFilterCanChangeMembership));
        return handle;
    }

    public bool Fail(TagSaveHandle handle, IList<TagSaveItem> items, IReadOnlyList<TagEditorSaveStep> accepted)
    {
        var save = Find(handle);
        if (save == null || save.HttpDone)
        {
            return false;
        }

        Project(items);
        var rolledBack = false;
        for (var stepIndex = save.Undos.Count - 1; stepIndex >= accepted.Count; stepIndex--)
        {
            var slots = save.Echoes.Where(slot => slot.StepIndex == stepIndex).ToList();
            if (slots.Count == 0)
            {
                if (save.Undos[stepIndex].Count > 0)
                {
                    TagSaveApply.Undo(items, save.Undos[stepIndex].AsEnumerable().Reverse().ToList());
                }

                rolledBack = true;
                continue;
            }

            var stepFailed = false;
            for (var slotIndex = slots.Count - 1; slotIndex >= 0; slotIndex--)
            {
                var slot = slots[slotIndex];
                if (slot.Confirmed)
                {
                    continue;
                }

                stepFailed = true;
                if (slot.Undos.Count == 0)
                {
                    continue;
                }

                TagSaveApply.Undo(items, slot.Undos.AsEnumerable().Reverse().ToList());
            }

            if (stepFailed)
            {
                rolledBack = true;
            }
        }

        save.Steps = accepted.ToList();
        Fold(save);
        _saves.Remove(save);
        return rolledBack;
    }

    public void Project(IList<TagSaveItem> items)
    {
        foreach (var save in _saves.ToList())
        {
            TagSaveApply.Apply(items, save.Steps);
        }
    }

    public void Sweep()
    {
        _saves.RemoveAll(save => save.HttpDone && save.Echoes.All(slot => slot.Seen));
    }

    public TagSaveEchoDecision Succeed(TagSaveHandle handle, bool reloadOnLand)
    {
        var save = Find(handle);
        if (save == null || save.HttpDone)
        {
            return new TagSaveEchoDecision(true, false, false);
        }

        var reload = (save.ForceReload || reloadOnLand || save.TagFilterCanChangeMembership) && !save.ReloadDone;
        if (reload)
        {
            save.ReloadDone = true;
        }

        save.HttpDone = true;
        Fold(save);
        var decision = new TagSaveEchoDecision(true, reload, save.ForceReload && reload);
        DropIfFinished(save);
        return decision;
    }

    public void NoteAutoTagResult(TagSaveHandle handle, IReadOnlyList<TagSaveAppliedTag> applied)
    {
        var save = Find(handle);
        if (save == null)
        {
            return;
        }

        var changedByTag = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        foreach (var row in applied)
        {
            var tags = Norm([row.TagName]);
            if (tags.Count != 1)
            {
                continue;
            }

            if (!changedByTag.TryGetValue(tags[0], out var paths))
            {
                paths = new HashSet<string>(StringComparer.Ordinal);
                changedByTag[tags[0]] = paths;
            }

            foreach (var path in Norm(row.ItemPaths))
            {
                paths.Add(path);
            }
        }

        foreach (var slot in save.Echoes)
        {
            if (slot.Seen || !slot.Echo.MatchPathsAsSubset)
            {
                continue;
            }

            var tags = Norm(slot.Echo.AddedTags);
            if (tags.Count != 1
                || !changedByTag.TryGetValue(tags[0], out var paths)
                || !Norm(slot.Echo.ItemIds).Any(paths.Contains))
            {
                slot.Seen = true;
            }
        }

        DropIfFinished(save);
    }

    public TagSaveEchoDecision OnEcho(TagSaveEcho echo, bool reloadOnLand)
    {
        var match = FindEcho(echo);
        if (match == null)
        {
            return new TagSaveEchoDecision(false, false, false);
        }

        match.Value.Slot.Seen = true;
        match.Value.Slot.Confirmed = true;
        if (match.Value.Slot.Echo.MatchAsSuperset)
        {
            return new TagSaveEchoDecision(false, false, false);
        }

        var reload = (match.Value.Save.ForceReload || reloadOnLand || match.Value.Save.TagFilterCanChangeMembership) && !match.Value.Save.ReloadDone;
        if (reload)
        {
            match.Value.Save.ReloadDone = true;
        }

        return new TagSaveEchoDecision(true, reload, match.Value.Save.ForceReload && reload);
    }

    private PendingSave? Find(TagSaveHandle handle)
    {
        return _saves.FirstOrDefault(save => save.Handle.Id == handle.Id);
    }

    private (PendingSave Save, PendingEcho Slot)? FindEcho(TagSaveEcho echo)
    {
        return FindEcho(echo, superset: false) ?? FindEcho(echo, superset: true);
    }

    private (PendingSave Save, PendingEcho Slot)? FindEcho(TagSaveEcho echo, bool superset)
    {
        (PendingSave Save, PendingEcho Slot)? best = null;
        var bestCount = int.MaxValue;
        foreach (var save in _saves)
        {
            foreach (var slot in save.Echoes)
            {
                if (slot.Seen || slot.Echo.MatchAsSuperset != superset || !MatchesEcho(slot.Echo, echo))
                {
                    continue;
                }

                var count = Norm(slot.Echo.ItemIds).Count;
                if (count >= bestCount)
                {
                    continue;
                }

                best = (save, slot);
                bestCount = count;
            }
        }

        return best;
    }

    private void Fold(PendingSave save)
    {
        if (save.Folded)
        {
            return;
        }

        TagSaveApply.Apply(_baseline, save.Steps);
        save.Folded = true;
    }

    private void DropIfFinished(PendingSave save)
    {
        if (save.HttpDone && save.Echoes.All(slot => slot.Seen))
        {
            _saves.Remove(save);
        }
    }

    private static bool MatchesEcho(TagSaveEcho expected, TagSaveEcho incoming)
    {
        if (!Same(expected.AddedTags, incoming.AddedTags) || !Same(expected.RemovedTags, incoming.RemovedTags))
        {
            return false;
        }

        if (expected.MatchAsSuperset)
        {
            var expectedIds = Norm(expected.ItemIds);
            if (expectedIds.Count == 0)
            {
                return false;
            }

            var incomingIds = Norm(incoming.ItemIds).ToHashSet(StringComparer.Ordinal);
            return expectedIds.All(incomingIds.Contains);
        }

        if (!expected.MatchPathsAsSubset)
        {
            return Same(expected.ItemIds, incoming.ItemIds);
        }

        var subsetIds = Norm(incoming.ItemIds);
        if (subsetIds.Count == 0)
        {
            return false;
        }

        var allowedIds = Norm(expected.ItemIds).ToHashSet(StringComparer.Ordinal);
        return subsetIds.All(allowedIds.Contains);
    }

    private static bool Same(IReadOnlyList<string> left, IReadOnlyList<string> right)
    {
        var a = Norm(left);
        var b = Norm(right);
        return a.SequenceEqual(b, StringComparer.Ordinal);
    }

    private static List<string> Norm(IReadOnlyList<string> values)
    {
        return values
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim().ToLowerInvariant())
            .Distinct(StringComparer.Ordinal)
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToList();
    }

    private sealed class PendingSave(
        TagSaveHandle handle,
        List<TagEditorSaveStep> steps,
        List<List<TagUndo>> undos,
        List<PendingEcho> echoes,
        bool forceReload,
        bool tagFilterCanChangeMembership)
    {
        public TagSaveHandle Handle { get; } = handle;
        public List<TagEditorSaveStep> Steps { get; set; } = steps;
        public List<List<TagUndo>> Undos { get; } = undos;
        public List<PendingEcho> Echoes { get; } = echoes;
        public bool ForceReload { get; } = forceReload;
        public bool TagFilterCanChangeMembership { get; } = tagFilterCanChangeMembership;
        public bool ReloadDone { get; set; }
        public bool HttpDone { get; set; }
        public bool Folded { get; set; }
    }

    private static List<PendingEcho> BuildPendingEchoes(
        IReadOnlyList<TagEditorSaveStep> steps,
        IReadOnlyList<IReadOnlyList<TagUndo>> undos)
    {
        var echoes = new List<PendingEcho>();
        for (var stepIndex = 0; stepIndex < steps.Count; stepIndex++)
        {
            var step = steps[stepIndex];
            var stepUndos = undos[stepIndex];
            switch (step.Kind)
            {
                case TagEditorSaveKind.ApplyItemTags:
                    echoes.Add(new PendingEcho(new TagSaveEcho
                    {
                        ItemIds = step.ItemIds.ToList(),
                        AddedTags = step.AddTags.ToList(),
                        RemovedTags = step.RemoveTags.ToList()
                    }, stepIndex, stepUndos.ToList()));
                    break;
                case TagEditorSaveKind.ApplyAutoTags:
                    var pool = stepUndos.ToList();
                    foreach (var assignment in step.Assignments)
                    {
                        if (string.IsNullOrWhiteSpace(assignment.TagName))
                        {
                            continue;
                        }

                        var paths = DistinctPaths(assignment.ItemPaths);
                        if (paths.Count == 0)
                        {
                            continue;
                        }

                        var mine = new List<TagUndo>();
                        for (var i = pool.Count - 1; i >= 0; i--)
                        {
                            if (pool[i].Remove.Contains(assignment.TagName, StringComparer.OrdinalIgnoreCase))
                            {
                                mine.Add(pool[i]);
                                pool.RemoveAt(i);
                            }
                        }

                        mine.Reverse();
                        echoes.Add(new PendingEcho(new TagSaveEcho
                        {
                            ItemIds = paths,
                            AddedTags = [assignment.TagName.Trim()],
                            RemovedTags = [],
                            MatchPathsAsSubset = true
                        }, stepIndex, mine));
                    }

                    break;
                case TagEditorSaveKind.RenameTag:
                case TagEditorSaveKind.DeleteTag:
                    var ids = stepUndos
                        .Select(undo => undo.ItemId)
                        .Where(id => !string.IsNullOrWhiteSpace(id))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();
                    if (ids.Count == 0)
                    {
                        break;
                    }

                    echoes.Add(new PendingEcho(new TagSaveEcho
                    {
                        ItemIds = ids,
                        AddedTags = step.Kind == TagEditorSaveKind.RenameTag
                            ? NonEmpty(step.NewName)
                            : [],
                        RemovedTags = step.Kind == TagEditorSaveKind.RenameTag
                            ? NonEmpty(step.OldName)
                            : NonEmpty(step.Name),
                        MatchAsSuperset = true
                    }, stepIndex, stepUndos.ToList()));
                    break;
            }
        }

        return echoes;
    }

    private static List<string> DistinctPaths(IReadOnlyList<string> paths)
    {
        var distinct = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in paths)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                continue;
            }

            var trimmed = path.Trim();
            if (seen.Add(trimmed))
            {
                distinct.Add(trimmed);
            }
        }

        return distinct;
    }

    private static List<string> NonEmpty(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? [] : [value.Trim()];
    }

    private sealed class PendingEcho(TagSaveEcho echo, int stepIndex, List<TagUndo> undos)
    {
        public TagSaveEcho Echo { get; } = echo;
        public int StepIndex { get; } = stepIndex;
        public List<TagUndo> Undos { get; } = undos;
        public bool Seen { get; set; }
        public bool Confirmed { get; set; }
    }
}
