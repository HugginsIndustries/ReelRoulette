# LibraryService Removal Plan (Temporary)

This document tracks the final cleanup needed to remove `LibraryService` entirely from the desktop client.

Goal: desktop remains server-authoritative and does not read/write local library files.

---

## 1) Unused in `LibraryService` (remove first)

These currently have no active external call sites and can be removed first:

- [x] Remove `RequiresTagMigration`
- [x] Remove `GetFingerprintProgressSnapshot()`
- [x] Remove `LoadLibrary()`
- [x] Remove `ImportFolder(...)`
- [x] Remove `RemoveSource(...)`
- [x] Remove `RemoveItem(...)`
- [x] Remove `RefreshSource(...)`
- [x] Remove `UpdateSource(...)`
- [x] Remove `AddOrUpdateCategory(...)`
- [x] Remove `AddOrUpdateTag(...)`
- [x] Remove `RenameTag(...)`
- [x] Remove `DeleteCategory(...)`
- [x] Remove `DeleteTag(...)`
- [x] Remove `ScanDuplicates(...)`
- [x] Remove `DeleteDuplicateFiles(...)`

After removal, also delete helper chains and DTO/model types that become orphaned as a result (fingerprint refresh/reconcile helpers, duplicate scan/delete models, and other method-private utilities no longer referenced).

- [x] Prune orphaned helper chains/types introduced by Section 1 removals

---

## 2) Effectively dead (remove after dead call paths)

These are referenced only by dead/uninvoked flows and should be removed with those flows:

- [x] Remove `CompleteMigration(...)`
  - only used by `ShowTagMigrationDialog()` in `MainWindow`, which currently has no callers
- [x] Remove `UpdateItem(...)`
  - only used by `ScanDurationsAsync(...)` and `ScanLoudnessAsync(...)`, which are no longer used by active scan entry points

Related dead `MainWindow` methods to delete in same pass:

- [x] Remove `ShowTagMigrationDialog()`
- [x] Remove `ScanDurationsAsync(...)`
- [x] Remove `ScanLoudnessAsync(...)`

---

## 3) Remaining methods to split/move before deleting `LibraryService`

These are still in active use and must be moved/replaced:

- [x] Replace usage of `LibraryIndex` (property)
- [x] Replace usage of `ReplaceProjection(...)`
- [x] Replace usage of `FindItemByPath(...)`
- [x] Replace usage of `GetItemsBySource(...)`
- [x] Replace usage of `GetSourceStatistics(...)`
- [x] Replace usage of `UpdateFilterPresetsForRenamedTag(...)` (static)
- [x] Replace usage of `UpdateFilterPresetsForDeletedTag(...)` (static)

### Split targets

1. **Projection ownership/read helpers**
   - [x] Keep desktop projection as a local read cache only (all clients remain server-authoritative at all times)
   - [x] Move `LibraryIndex` projection holder behavior and `ReplaceProjection(...)` behavior into `MainWindow`
   - [x] Replace all `FindItemByPath(...)` usage with direct `_libraryIndex.Items.FirstOrDefault(...)` helpers in `MainWindow`

2. **Server-owned reusable library/source stats (`/api/library/stats`)**
   - [x] Add server contracts for a single `GET /api/library/stats` response that includes:
     - [x] global totals (videos, photos, media, favorites, blacklisted, unique played, never played, total plays)
     - [x] per-source totals/stats needed by Manage Sources (counts, audio/no-audio, duration totals/averages)
   - [x] Implement `GET /api/library/stats` in server services/hosting so stats are computed server-side from the canonical library projection
   - [x] Add/extend desktop API client to request `/api/library/stats`
   - [x] Refactor `ManageSourcesDialog` to consume `/api/library/stats` instead of `GetItemsBySource(...)`/`GetSourceStatistics(...)`
   - [x] Remove remaining desktop-side source stats/count calculations after UI reads from server stats payload

3. **Filter preset tag updates**
   - [x] Remove client-side preset tag mutation helpers (`UpdateFilterPresetsForRenamedTag(...)` / `UpdateFilterPresetsForDeletedTag(...)`)
   - [x] Keep preset tag mutation logic server-only (applied by core tag mutation endpoints/handlers)
   - [x] Ensure clients resync preset catalog from server after tag rename/delete operations

---

## 4a) Finalize server-owned backup system (before removing local leftovers)

Backup behavior should be fully server-authoritative and policy-consistent before deleting residual desktop-local backup paths.

- [x] Core startup: backfill missing `core-settings.json` sections/fields on startup
- [x] Core startup: create `core-settings.json` startup backup only when no backup exists within `MinimumBackupGapMinutes`
- [x] Library startup: create `library.json` startup backup only when no backup exists within `MinimumBackupGapMinutes`
- [x] Core settings mutation saves: if no `core-settings.json` backup exists within `MinimumBackupGapMinutes`, create one; otherwise skip create/delete (no churn)
- [x] Library mutation saves: if no `library.json` backup exists within `MinimumBackupGapMinutes`, create one; otherwise skip create/delete (no churn)
- [x] Backup retention algorithm: if latest backup is newer than gap, skip backup creation and do not delete backups
- [x] Backup retention algorithm: when gap is satisfied, create backup then trim oldest backups to `NumberOfBackups`
- [x] Use consistent UTC-based timestamps for backup age checks (`DateTime.UtcNow` + `CreationTimeUtc`/`LastWriteTimeUtc`)
- [x] Add/update server tests covering startup + mutation backup behavior (gap respected, no churn, max retention enforced)

---

## 4b) Non-authoritative leftovers to remove (not split)

These are still referenced but should be removed, not migrated:

- [x] Remove `SaveLibrary()`
- [x] Remove `CreateBackupIfNeeded(...)`
- [x] Remove `StartPostLoadBackgroundWork()`
- [x] Remove `FingerprintProgressUpdated` event
- [x] Remove `IsRefreshRunning`

Caller updates should remove related UI/status behaviors tied to local library write/scan lifecycle.

- [x] Remove caller-side UI/status code tied to local library write/scan lifecycle

---

## 4c) Make `LibraryOperationsService` authoritative for all library mutations

All library-content mutations must persist through `LibraryOperationsService` first; `ServerStateService` should publish events from persisted results only.

- [x] Inventory all mutation entry points (HTTP endpoints + internal calls) and map each to a single `LibraryOperationsService` method
- [x] Move favorite mutation authority to `LibraryOperationsService` (persist to `library.json`), removing in-memory-only writes in `ServerStateService`
- [x] Move blacklist mutation authority to `LibraryOperationsService` (persist to `library.json`), removing in-memory-only writes in `ServerStateService`
- [x] Move item tag apply authority to `LibraryOperationsService` (persist + return canonical item state)
- [x] Move tag catalog mutations to `LibraryOperationsService` (`upsertTag`, `renameTag`, `deleteTag`) with canonical persisted responses
- [x] Move category catalog mutations to `LibraryOperationsService` (`upsertCategory`, `deleteCategory`) with canonical persisted responses
- [x] Ensure playback-stat mutations that affect library items (`playCount`, `lastPlayedUtc`, clear-stats paths) are persisted via `LibraryOperationsService`
- [x] Ensure destructive library mutations (item/source remove paths) execute through `LibraryOperationsService` only
- [x] Update server hosting endpoints to call `LibraryOperationsService` for mutation, then call `ServerStateService` only to publish SSE using persisted/canonical values
- [x] Remove/disable residual mutation logic in `ServerStateService`; keep it focused on state projection + event publishing
- [x] Standardize mutation responses so callers can immediately reconcile from canonical persisted state (`revision`, favorite/blacklist flags, tags/categories where applicable)
- [x] Add/expand server tests proving persistence-first behavior for each mutation family and no split-brain between in-memory state and `library.json`

---

## 4d) Tag apply performance hardening (minimal patch sequence)

Apply-path correctness is now fixed, but tag apply UX is too slow/heavy. Implement the minimal sequence below to keep server-authoritative behavior while removing redundant full sync/rebuild work.

1. **Keep SSE-driven sync (single source for apply completion)**
   - [x] In desktop `ApplyItemTagDeltaAsync(...)`, remove the immediate `await SyncLibraryProjectionFromCoreAsync()` after successful API apply.
   - [x] Return success after API acceptance and let SSE (`itemTagsChanged`/`tagCatalogChanged`) drive projection/catalog updates.
   - [x] Keep failure path unchanged (`false` on non-2xx).

2. **Eliminate O(n^2) filter join in library panel rebuild**
   - [x] In `UpdateLibraryPanelInternal(...)`, replace `items.Where(... eligibleItems.Any(...))` with `HashSet<string>` membership on `FullPath` (`Contains`).
   - [x] Preserve case-insensitive matching (`StringComparer.OrdinalIgnoreCase`).
   - [x] Confirm no behavior change for active FilterState combinations.

3. **Avoid full projection sync on `itemTagsChanged`**
   - [x] Replace `ApplyItemTagsProjection(...)` full projection pull with targeted in-memory tag updates for affected items only.
   - [x] Trigger lightweight UI refresh path only (no full `/api/library/projection` fetch unless payload is malformed/incomplete).
   - [x] Keep fallback to full projection sync on mismatch/unknown items.

4. **Only emit `tagCatalogChanged` when catalog actually changed**
   - [x] In `/api/tag-editor/apply-item-tags`, publish `itemTagsChanged` always when accepted item deltas exist.
   - [x] Publish `tagCatalogChanged` only when apply operation actually created/renamed/deleted catalog entries.
   - [x] Include tests covering both cases (item-only delta vs item+catalog delta) and event counts.

5. **Remove remaining tag-dialog full-sync/rebuild triggers**
   - [x] In desktop tag/category mutation command paths (`UpsertCategoryAsync`, `DeleteCategoryAsync`, `UpsertTagAsync`, `RenameTagAsync`, `DeleteTagAsync`), switch readiness checks to command-only availability and remove immediate `SyncLibraryProjectionFromCoreAsync()` calls after accepted API responses.
   - [x] In `ItemTagsDialog.ApplyPendingCategoryMutationsAsync(...)`, upsert only dirty/new/reordered categories instead of replaying every reorderable category on each save.
   - [x] Remove remaining post-dialog full projection sync calls in tag-dialog save/apply call paths and rely on SSE (`itemTagsChanged`/`tagCatalogChanged`) for reconciliation.
   - [x] Avoid full `RecalculateGlobalStats()` / panel rebuild work on tag-catalog-only updates where item eligibility and playback/favorite/blacklist state are unchanged.

6. **Verification + perf guardrails**
   - [x] Re-run full build/tests with zero warnings/errors.
   - [x] Manual verify: tag apply closes promptly (target near network round-trip + small UI update, no 10-15s stall).
   - [x] Manual verify: CPU/fan spike during apply is materially reduced on large libraries.
   - [x] Manual verify: no regressions in tag/category correctness, favorites/blacklist, and projection sync behavior.

---

## 5) Final `LibraryService.cs` deletion sequence

- [x] Remove Section 1 methods and prune newly-orphaned internals/types
- [x] Remove dead `MainWindow` call paths, then remove Section 2 methods
- [x] Complete all splits from Section 3 and update call sites
- [x] Remove Section 4 leftovers and any remaining references
- [x] Complete Section 4c authority migration so all library mutations persist via `LibraryOperationsService`
- [x] Delete `LibraryService.cs`
- [x] Verify no HTTP mutation endpoint performs in-memory-only writes (all mutation endpoints call `LibraryOperationsService` first, then publish SSE from persisted state)
- [x] Verify `ServerStateService` has no residual library-mutation authority paths (favorite/blacklist/tags/categories/playback/remove)
- [x] Verify mutation responses include canonical persisted state needed for immediate client reconciliation (`revision`, item flags, and relevant tag/category fields)
- [x] Build and run server mutation authority tests:
  - [x] favorites/blacklist persistence-first + SSE payload parity
  - [x] tag/category mutation persistence-first + projection parity
  - [x] playback stat mutation persistence-first + projection parity
  - [x] remove item/source persistence-first + projection parity
  - [x] no split-brain regression coverage (in-memory vs `library.json`)
- [x] Build and run regression checks:
  - [x] library panel filtering/sorting/selection
  - [x] favorite/blacklist flows
  - [x] tag/category edits and preset updates
  - [x] manage sources display and actions
  - [x] reconnect + projection sync behavior
  - [x] playback stats update/clear flows remain stable after mutation-authority migration
  - [x] mutation round-trips reconcile immediately from canonical server state (no stale favorites/tags after apply + sync)
