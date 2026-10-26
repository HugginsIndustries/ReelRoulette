import { describe, expect, it, vi } from "vitest";
import { createTagCatalog } from "../tags/tagCatalog";

const CATALOG = {
  categories: [{ id: "cat-places", name: "Places", sortOrder: 0 }],
  tags: [{ name: "Beach", categoryId: "cat-places" }],
  tagCounts: [],
  itemCount: 0
};

/** A catalog with a fake model route and a fake connection whose events the test sends. */
function setup() {
  const handlers = new Map<string, (payload: any) => void>();
  const postJson = vi.fn(async () => CATALOG);
  const catalog = createTagCatalog({
    api: { postJson },
    connection: { on: (event: string, handler: (payload: any) => void) => void handlers.set(event, handler) } as any
  });
  const send = (event: string, payload: unknown = {}) => handlers.get(event)!(payload);
  return { catalog, postJson, send };
}

describe("tag catalog", () => {
  it("loads once, and not again while it has one", async () => {
    const { catalog, postJson } = setup();

    await Promise.all([catalog.ensureLoaded(), catalog.ensureLoaded()]);
    await catalog.ensureLoaded();

    expect(postJson).toHaveBeenCalledTimes(1);
    expect(postJson).toHaveBeenCalledWith("/api/tag-editor/model", { itemIds: [] });
    expect(catalog.catalog.value).toEqual({ categories: CATALOG.categories, tags: CATALOG.tags });
  });

  it("takes a catalog change from any client, and keeps what it has for a payload that isn't a catalog", () => {
    const { catalog, send } = setup();
    catalog.take(CATALOG);

    send("tagCatalogChanged", { reason: "rename", categories: [], tags: [{ name: "Shore", categoryId: "" }] });
    expect(catalog.catalog.value).toEqual({ categories: [], tags: [{ name: "Shore", categoryId: "" }] });

    send("tagCatalogChanged", { reason: "rename" });
    catalog.take(null);
    expect(catalog.catalog.value?.tags).toEqual([{ name: "Shore", categoryId: "" }]);
  });

  it("drops the catalog on a resync, which may have missed a change, and loads it again when asked", async () => {
    const { catalog, postJson, send } = setup();
    catalog.take(CATALOG);

    send("resyncRequired");
    expect(catalog.catalog.value).toBeNull();
    await catalog.ensureLoaded();

    expect(postJson).toHaveBeenCalledTimes(1);
    expect(catalog.catalog.value?.tags).toEqual(CATALOG.tags);
  });
});
