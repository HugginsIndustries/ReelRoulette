import { signal, type ReadonlySignal } from "@preact/signals";
import type { AppApi } from "../state/appApi";
import type { ServerConnection } from "../state/serverConnection";
import type { CatalogTag, TagCategory } from "./tagEditorModel";

/** The tag catalog: its categories and its tags, each with the id of its category, empty for none. */
export interface TagCatalogSnapshot {
  categories: TagCategory[];
  tags: CatalogTag[];
}

/**
 * The tag catalog as the server last gave it, shared by the tabs that show it: the Tags and Filter tabs give it each
 * catalog they load, and a catalog change from any client brings the new one, so the Stats tab orders a file's tags
 * without loading the catalog again. A resync drops it, since a change may have been missed.
 */
export interface TagCatalog {
  /** The catalog, or null before one has loaded. */
  readonly catalog: ReadonlySignal<TagCatalogSnapshot | null>;
  /** Takes a catalog a tab loaded, as `POST /api/tag-editor/model` returns it. */
  take(model: unknown): void;
  /** Loads the catalog when none has loaded since the page started or the last resync. */
  ensureLoaded(): Promise<void>;
}

export interface TagCatalogOptions {
  api: Pick<AppApi, "postJson">;
  connection: Pick<ServerConnection, "on">;
}

function parseCatalog(raw: unknown): TagCatalogSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const categories = row.categories ?? row.Categories;
  const tags = row.tags ?? row.Tags;
  if (!Array.isArray(categories) || !Array.isArray(tags)) {
    return null;
  }
  return {
    categories: categories
      .filter((category) => category && typeof category === "object" && category.id != null)
      .map((category) => ({ id: String(category.id), name: String(category.name ?? ""), sortOrder: Number(category.sortOrder ?? 0) })),
    tags: tags
      .filter((tag) => tag && typeof tag === "object" && typeof tag.name === "string" && tag.name.trim() !== "")
      .map((tag) => ({ name: String(tag.name), categoryId: String(tag.categoryId ?? "") }))
  };
}

export function createTagCatalog(options: TagCatalogOptions): TagCatalog {
  const { api, connection } = options;
  const catalog = signal<TagCatalogSnapshot | null>(null);
  let loading: Promise<void> | null = null;

  function take(model: unknown): void {
    const parsed = parseCatalog(model);
    if (parsed) {
      catalog.value = parsed;
    }
  }

  connection.on("tagCatalogChanged", take);
  connection.on("resyncRequired", () => {
    catalog.value = null;
  });

  return {
    catalog,
    take,
    ensureLoaded() {
      if (catalog.peek()) {
        return Promise.resolve();
      }
      loading ??= api
        .postJson("/api/tag-editor/model", { itemIds: [] })
        .then(take)
        .finally(() => {
          loading = null;
        });
      return loading;
    }
  };
}
