# M6a Domain Inventory

## Pure Domain Logic (tag/category/item-tag API contracts + mutation semantics)

- Tag-editor contracts and event payloads:
  - `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs` (`TagEditorModel*`, `ApplyItemTagsRequest`, `SyncTagCatalogRequest`, `SyncItemTagsRequest`, category/tag CRUD requests, `ItemTagsChangedPayload`, `TagCatalogChangedPayload`).
- Tag state mutation and projection service:
  - `src/core/ReelRoulette.Server/Services/ServerStateService.cs` (batch item-tag deltas, category/tag upsert/rename/delete, canonical `uncategorized` reassignment semantics, catalog + item-tag sync hydration, replayable tag events).
- API endpoint composition:
  - `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` (`/api/tag-editor/*` endpoints including `sync-catalog` and `sync-item-tags`, with request validation and command routing).

## IO / Service Adapters (desktop/web client mutation paths)

- Desktop API-client extensions:
  - `source/CoreServerApiClient.cs` (typed tag-editor query/command methods + client DTOs).
- Desktop orchestration seam for tag mutations:
  - `source/ITagMutationClient.cs` (UI dialog to API mutation contract).
  - `source/MainWindow.axaml.cs` (API-first tag mutation methods, tag SSE projection handlers, web-remote service delegation, startup/connect catalog sync to core, pre-model item-tag hydration).
- Web remote API bridge:
  - `source/WebRemote/IWebRemoteApiServices.cs` (tag-editor command/query service surface).
  - `source/WebRemote/WebRemoteServer.cs` (tag-editor web endpoints mapped to shared API services).

## UI Orchestration (desktop + web)

- Desktop tag editor migrated to API mutation bridge:
  - `source/ItemTagsDialog.axaml.cs` and `source/ItemTagsDialog.axaml` (batch item-tag apply and tag/category edits routed through `ITagMutationClient`, with combined top/bottom control layout parity and ordered chip controls `➕`, `➖`, `✏️`, `🗑` using shared button styles).
- Web full-screen tag editor:
  - `source/WebRemote/ui/index.html`, `source/WebRemote/ui/app.css`, `source/WebRemote/ui/app.js` (combined ItemTags/ManageTags editor UI, touch-first controls, collapsible categories, staged batch apply, pause/resume playback behavior, API-driven tag operations).
