using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class TagSaveApplyTests
{
    [Fact]
    public void Save_UpdatesTilesImmediately_RollsBackFailedTail_AndSkipsOwnEcho()
    {
        var items = new List<TagSaveItem>
        {
            new() { Id = "a", FullPath = "/media/a.mp4", Tags = ["Day"] }
        };
        var steps = new List<TagEditorSaveStep>
        {
            new() { Kind = TagEditorSaveKind.RenameTag, OldName = "Day", NewName = "Evening" },
            new()
            {
                Kind = TagEditorSaveKind.ApplyItemTags,
                ItemIds = ["a"],
                AddTags = ["Night"]
            }
        };
        var session = new TagSaveSession();
        var handle = session.Begin(items, steps, forceReload: false);
        Assert.Equal(["Evening", "Night"], items[0].Tags);

        var reloads = 0;
        var ownEcho = new TagSaveEcho { ItemIds = ["a"], AddedTags = ["Night"] };
        var echoed = session.OnEcho(ownEcho, reloadOnLand: true);
        if (!echoed.SkipPatch)
        {
            items[0].Tags.AddRange(ownEcho.AddedTags);
        }

        if (echoed.Reload)
        {
            reloads++;
        }

        var landed = session.Succeed(handle, reloadOnLand: true);
        if (landed.Reload)
        {
            reloads++;
        }

        Assert.True(echoed.SkipPatch);
        Assert.True(echoed.Reload);
        Assert.False(landed.ForceReload);
        Assert.False(landed.Reload);
        Assert.Equal(1, reloads);
        Assert.Equal(["Evening", "Night"], items[0].Tags);

        var failed = new List<TagSaveItem>
        {
            new() { Id = "a", FullPath = "/media/a.mp4", Tags = ["Day"] }
        };
        var failedSnapshot = TagSaveApply.Snapshot(failed);
        TagSaveApply.Apply(failed, steps);
        TagSaveApply.Rollback(failed, failedSnapshot, [steps[0]]);
        Assert.Equal(["Evening"], failed[0].Tags);
        Assert.Equal(["Day"], failedSnapshot[0].Tags);
    }

    [Fact]
    public void RenameOnlySave_ReloadsOnceWhenTheFilterCanChangeMembership()
    {
        var session = new TagSaveSession();
        var items = new List<TagSaveItem>();
        var handle = session.Begin(items, [], forceReload: false);
        var landed = session.Succeed(handle, reloadOnLand: true);
        var again = session.Succeed(handle, reloadOnLand: true);

        Assert.True(landed.Reload);
        Assert.False(landed.ForceReload);
        Assert.False(again.Reload);
    }

    [Fact]
    public void EchoFromAnotherClient_IsNotSkipped()
    {
        var session = new TagSaveSession();
        var decision = session.OnEcho(new TagSaveEcho
        {
            ItemIds = ["other"],
            AddedTags = ["Night"]
        }, reloadOnLand: true);

        Assert.False(decision.SkipPatch);
        Assert.False(decision.Reload);
    }

    [Fact]
    public void NewerSave_CompletesFirst_AndOlderEchoStaysItsOwn()
    {
        var items = Items("Day");
        var session = new TagSaveSession();
        var older = session.Begin(items, [Add("Night")], forceReload: false);
        var newer = session.Begin(items, [Add("Evening")], forceReload: true);

        var landed = session.Succeed(newer, reloadOnLand: false);
        var olderEcho = session.OnEcho(new TagSaveEcho { ItemIds = ["a"], AddedTags = ["Night"] }, reloadOnLand: false);
        var olderLanded = session.Succeed(older, reloadOnLand: false);

        Assert.True(landed.Reload);
        Assert.True(landed.ForceReload);
        Assert.True(olderEcho.SkipPatch);
        Assert.False(olderEcho.Reload);
        Assert.False(olderEcho.ForceReload);
        Assert.False(olderLanded.Reload);
        Assert.Equal(["Day", "Night", "Evening"], items[0].Tags);
    }

    [Fact]
    public void FailingTheNewerSave_DoesNotDropTheOlderEcho()
    {
        var items = Items("Day");
        var session = new TagSaveSession();
        session.Begin(items, [Add("Night")], forceReload: false);
        var newer = session.Begin(items, [Add("Evening")], forceReload: false);

        session.Fail(newer, items, []);
        var olderEcho = session.OnEcho(new TagSaveEcho { ItemIds = ["a"], AddedTags = ["Night"] }, reloadOnLand: false);

        Assert.Equal(["Day", "Night"], items[0].Tags);
        Assert.True(olderEcho.SkipPatch);
        Assert.False(olderEcho.Reload);
    }

    [Fact]
    public void FailingTheOlderSave_KeepsTheNewerTags()
    {
        var items = Items("Day");
        var session = new TagSaveSession();
        var older = session.Begin(items, [Add("Night")], forceReload: false);
        session.Begin(items, [Add("Evening")], forceReload: false);

        session.Fail(older, items, []);

        Assert.Equal(["Day", "Evening"], items[0].Tags);
    }

    [Fact]
    public void FailingTheSave_KeepsATagThatArrivedAfterItStarted()
    {
        var items = Items("Day");
        var session = new TagSaveSession();
        var handle = session.Begin(items, [Add("Night")], forceReload: false);
        items[0].Tags.Add("Bonus");

        session.Fail(handle, items, []);

        Assert.Equal(["Day", "Bonus"], items[0].Tags);
    }

    [Fact]
    public void FailingTheTail_KeepsTheAcceptedRename_AndATagThatArrivedDuringTheSave()
    {
        var items = Items("Day");
        var rename = Rename("Day", "Evening");
        var session = new TagSaveSession();
        var handle = session.Begin(items, [rename, Add("Night")], forceReload: false);
        items[0].Tags.Add("Bonus");

        session.Fail(handle, items, [rename]);

        Assert.Equal(["Evening", "Bonus"], items[0].Tags);
    }

    [Fact]
    public void FailingARename_PutsTheOldNameBack_AndKeepsANameThatWasAlreadyThere()
    {
        var items = new List<TagSaveItem>
        {
            new() { Id = "a", FullPath = "/media/a.mp4", Tags = ["Day", "Evening"] }
        };
        var session = new TagSaveSession();
        var handle = session.Begin(items, [Rename("Day", "Evening")], forceReload: false);
        items[0].Tags.Add("Bonus");

        session.Fail(handle, items, []);

        Assert.Equal(["Evening", "Bonus", "Day"], items[0].Tags);
    }

    [Fact]
    public void RenameAndDelete_RetargetIncludeAndExcludeTags()
    {
        var selected = new List<string> { "Day", "Night" };
        var excluded = new List<string> { "day" };
        var rename = Rename("Day", "Evening");

        Assert.True(TagSaveApply.RetargetFilterTags(selected, rename));
        Assert.True(TagSaveApply.RetargetFilterTags(excluded, rename));
        Assert.Equal(["Evening", "Night"], selected);
        Assert.Equal(["Evening"], excluded);

        var delete = new TagEditorSaveStep { Kind = TagEditorSaveKind.DeleteTag, Name = "Night" };
        Assert.True(TagSaveApply.RetargetFilterTags(selected, delete));
        Assert.False(TagSaveApply.RetargetFilterTags(excluded, delete));
        Assert.Equal(["Evening"], selected);
        Assert.Equal(["Evening"], excluded);
    }

    [Fact]
    public void SaveThatStartedUnderATagFilter_ReloadsOnceAfterThatFilterIsEmpty()
    {
        var session = new TagSaveSession();
        var handle = session.Begin(Items("Day"), [], forceReload: false, tagFilterCanChangeMembership: true);
        var landed = session.Succeed(handle, reloadOnLand: false);
        var again = session.Succeed(handle, reloadOnLand: false);

        Assert.True(landed.Reload);
        Assert.False(landed.ForceReload);
        Assert.False(again.Reload);
    }

    [Fact]
    public void SaveThatDidNotStartUnderATagFilter_DoesNotReload()
    {
        var session = new TagSaveSession();
        var handle = session.Begin(Items("Day"), [], forceReload: false, tagFilterCanChangeMembership: false);
        var landed = session.Succeed(handle, reloadOnLand: false);

        Assert.False(landed.Reload);
    }

    [Fact]
    public void AutoTagEcho_MatchesASubsetOfThatTagsPaths_AndDoesNotTakeAnotherItemTag()
    {
        var session = new TagSaveSession();
        session.Begin(Items("Day"), [AutoTags(("Cat", ["a", "b"]), ("Dog", ["c", "d"]))], forceReload: false);
        var cat = session.OnEcho(new TagSaveEcho { ItemIds = ["a"], AddedTags = ["Cat"], RemovedTags = [] }, reloadOnLand: false);
        var other = session.OnEcho(new TagSaveEcho { ItemIds = ["a"], AddedTags = ["Night"], RemovedTags = [] }, reloadOnLand: false);

        Assert.True(cat.SkipPatch);
        Assert.False(other.SkipPatch);
    }

    [Fact]
    public void ItemTagEcho_DoesNotMatchASubsetOfItsItems()
    {
        var session = new TagSaveSession();
        session.Begin(Items("Day"), [
            new TagEditorSaveStep
            {
                Kind = TagEditorSaveKind.ApplyItemTags,
                ItemIds = ["a", "b"],
                AddTags = ["Night"]
            }
        ], forceReload: false);
        var decision = session.OnEcho(new TagSaveEcho { ItemIds = ["a"], AddedTags = ["Night"], RemovedTags = [] }, reloadOnLand: false);

        Assert.False(decision.SkipPatch);
    }

    [Fact]
    public void SmallerAutoTagSave_TakesTheMatchingEvent()
    {
        var session = new TagSaveSession();
        session.Begin(Items("Day"), [Auto("Cat", "a", "b", "c")], forceReload: false);
        session.Begin(Items("Day"), [Auto("Cat", "a")], forceReload: true);
        var decision = session.OnEcho(new TagSaveEcho { ItemIds = ["a"], AddedTags = ["Cat"], RemovedTags = [] }, reloadOnLand: false);

        Assert.True(decision.SkipPatch);
        Assert.True(decision.Reload);
        Assert.True(decision.ForceReload);
    }

    [Fact]
    public void AutoTagAssignmentWithNoChangedPaths_IsRetired_AndALaterEventIsApplied()
    {
        var session = new TagSaveSession();
        var handle = session.Begin(Items("Day"), [AutoTags(("Cat", ["a", "b"]), ("Dog", ["c"]))], forceReload: false);
        session.NoteAutoTagResult(handle, [Applied("Dog", "c")]);
        var cat = session.OnEcho(new TagSaveEcho { ItemIds = ["a"], AddedTags = ["Cat"], RemovedTags = [] }, reloadOnLand: false);
        var dog = session.OnEcho(new TagSaveEcho { ItemIds = ["c"], AddedTags = ["Dog"], RemovedTags = [] }, reloadOnLand: false);

        Assert.False(cat.SkipPatch);
        Assert.True(dog.SkipPatch);
    }

    [Fact]
    public void AutoTagOnASharedPath_RetiresOnlyTheTagThatWasNotWritten()
    {
        var session = new TagSaveSession();
        var handle = session.Begin(Items("Day"), [AutoTags(("Cat", ["a"]), ("Dog", ["a"]))], forceReload: false);
        session.NoteAutoTagResult(handle, [Applied("Dog", "a")]);
        var cat = session.OnEcho(new TagSaveEcho { ItemIds = ["a"], AddedTags = ["Cat"], RemovedTags = [] }, reloadOnLand: false);
        var dog = session.OnEcho(new TagSaveEcho { ItemIds = ["a"], AddedTags = ["Dog"], RemovedTags = [] }, reloadOnLand: false);

        Assert.False(cat.SkipPatch);
        Assert.True(dog.SkipPatch);
    }

    [Fact]
    public void ConfirmedItemTagEcho_KeepsTheTagWhenTheSaveFails()
    {
        var items = Items("Day");
        var session = new TagSaveSession();
        var handle = session.Begin(items, [Add("Night")], forceReload: false);
        var echoed = session.OnEcho(new TagSaveEcho { ItemIds = ["a"], AddedTags = ["Night"], RemovedTags = [] }, reloadOnLand: false);
        Assert.True(echoed.SkipPatch);

        items[0].Tags = ["Day"];
        var rolledBack = session.Fail(handle, items, []);

        Assert.False(rolledBack);
        Assert.Equal(["Day", "Night"], items[0].Tags);
    }

    [Fact]
    public void ConfirmedRename_StaysWhenALaterStepRollsBack()
    {
        var items = Items("Day");
        var rename = Rename("Day", "Evening");
        var session = new TagSaveSession();
        var handle = session.Begin(items, [rename, Add("Night")], forceReload: false);
        var echoed = session.OnEcho(new TagSaveEcho
        {
            ItemIds = ["a", "library-other"],
            AddedTags = ["Evening"],
            RemovedTags = ["Day"]
        }, reloadOnLand: false);
        Assert.False(echoed.SkipPatch);
        Assert.False(echoed.Reload);

        items[0].Tags = ["Day"];
        var rolledBack = session.Fail(handle, items, []);

        Assert.True(rolledBack);
        Assert.Equal(["Evening"], items[0].Tags);
    }

    [Fact]
    public void Project_RestoresAnInFlightSaveOntoReplacedItems()
    {
        var session = new TagSaveSession();
        session.Begin(Items("Day"), [Add("Night")], forceReload: false);
        var current = Items("Day");

        session.Project(current);

        Assert.Equal(["Day", "Night"], current[0].Tags);
    }

    [Fact]
    public void ConfirmedAutoTag_StaysWhenTheOtherAssignmentRollsBack()
    {
        var items = new List<TagSaveItem>
        {
            new() { Id = "a", FullPath = "/media/a.mp4", Tags = ["Day"] },
            new() { Id = "c", FullPath = "/media/c.mp4", Tags = ["Day"] }
        };
        var session = new TagSaveSession();
        var handle = session.Begin(items, [AutoTags(("Cat", ["a"]), ("Dog", ["c"]))], forceReload: false);
        var dog = session.OnEcho(new TagSaveEcho { ItemIds = ["c"], AddedTags = ["Dog"], RemovedTags = [] }, reloadOnLand: false);
        Assert.True(dog.SkipPatch);

        items[0].Tags = ["Day"];
        items[1].Tags = ["Day"];
        var rolledBack = session.Fail(handle, items, []);

        Assert.True(rolledBack);
        Assert.Equal(["Day"], items[0].Tags);
        Assert.Equal(["Day", "Dog"], items[1].Tags);
    }

    [Fact]
    public void RetiredAutoTag_StillRollsBackWhenTheSaveFails()
    {
        var items = Items("Day");
        var session = new TagSaveSession();
        var handle = session.Begin(items, [Auto("Cat", "a")], forceReload: false);
        session.NoteAutoTagResult(handle, []);

        var rolledBack = session.Fail(handle, items, []);

        Assert.True(rolledBack);
        Assert.Equal(["Day"], items[0].Tags);
    }

    [Fact]
    public void IncomingRename_UpdatesTheFilterBeforeTheOtherClientReloads()
    {
        var seen = ApplyIncoming(new IncomingItemTagsEvent
        {
            AddedTags = ["Late"],
            RemovedTags = ["Night"],
            CatalogReplacedTag = "Night",
            CatalogReplacementTag = "Late"
        });

        Assert.Equal(["Late"], seen.Selected);
        Assert.Equal(["Late"], seen.Excluded);
        Assert.False(seen.Handling.ReloadBecauseFilterCleared);
    }

    [Fact]
    public void IncomingPerItemEdit_LeavesTheFilterInPlace()
    {
        var seen = ApplyIncoming(new IncomingItemTagsEvent
        {
            AddedTags = ["Late"],
            RemovedTags = ["Night"]
        });

        Assert.Equal(["Night"], seen.Selected);
        Assert.Equal(["Night"], seen.Excluded);
        Assert.False(seen.Handling.ReloadBecauseFilterCleared);
    }

    [Fact]
    public void IncomingDelete_RemovesTheTagBeforeTheOtherClientReloads()
    {
        var seen = ApplyIncoming(new IncomingItemTagsEvent
        {
            AddedTags = [],
            RemovedTags = ["Night"],
            CatalogReplacedTag = "Night"
        });

        Assert.Empty(seen.Selected);
        Assert.Empty(seen.Excluded);
        Assert.True(seen.Handling.ReloadBecauseFilterCleared);
    }

    private static (List<string> Selected, List<string> Excluded, IncomingTagHandling Handling) ApplyIncoming(IncomingItemTagsEvent incoming)
    {
        var selected = new List<string> { "Night" };
        var excluded = new List<string> { "Night" };
        List<string>? seenSelected = null;
        List<string>? seenExcluded = null;
        IncomingTagHandling handling = default;
        TagSaveApply.HandleIncomingItemTags(
            incoming,
            () => selected.Count > 0 || excluded.Count > 0,
            step =>
            {
                TagSaveApply.RetargetFilterTags(selected, step);
                TagSaveApply.RetargetFilterTags(excluded, step);
            },
            result =>
            {
                handling = result;
                seenSelected = selected.ToList();
                seenExcluded = excluded.ToList();
            });
        return (seenSelected ?? [], seenExcluded ?? [], handling);
    }

    private static TagSaveAppliedTag Applied(string tag, params string[] paths)
    {
        return new TagSaveAppliedTag { TagName = tag, ItemPaths = paths };
    }

    private static List<TagSaveItem> Items(string tag)
    {
        return
        [
            new TagSaveItem { Id = "a", FullPath = "/media/a.mp4", Tags = [tag] }
        ];
    }

    private static TagEditorSaveStep Add(string tag)
    {
        return new TagEditorSaveStep
        {
            Kind = TagEditorSaveKind.ApplyItemTags,
            ItemIds = ["a"],
            AddTags = [tag]
        };
    }

    private static TagEditorSaveStep Rename(string oldName, string newName)
    {
        return new TagEditorSaveStep
        {
            Kind = TagEditorSaveKind.RenameTag,
            OldName = oldName,
            NewName = newName
        };
    }

    private static TagEditorSaveStep Auto(string tag, params string[] paths)
    {
        return AutoTags((tag, paths));
    }

    private static TagEditorSaveStep AutoTags(params (string Tag, string[] Paths)[] assignments)
    {
        return new TagEditorSaveStep
        {
            Kind = TagEditorSaveKind.ApplyAutoTags,
            Assignments = assignments.Select(assignment => new TagEditorAutoTagAssignment
            {
                TagName = assignment.Tag,
                ItemPaths = assignment.Paths.ToList()
            }).ToList()
        };
    }
}
