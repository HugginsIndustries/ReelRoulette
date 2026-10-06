import { afterEach, describe, expect, it } from "vitest";
import { createLibraryGridController } from "../library/libraryGridController";
import type { LibraryProjectionItem } from "../library/libraryProjectionModel";

class FakeElement {
  className = "";
  textContent = "";
  innerHTML = "";
  style = { height: "" };
  parent: FakeElement | null = null;
  children: FakeElement[] = [];
  layoutWidth = 0;
  private hiddenFlag = false;
  private scrollOffset = 0;

  get hidden(): boolean {
    return this.hiddenFlag;
  }

  set hidden(value: boolean) {
    this.hiddenFlag = value;
  }

  get clientWidth(): number {
    return this.hasBox() ? this.rootWidth() : 0;
  }

  get clientHeight(): number {
    return this.hasBox() ? 600 : 0;
  }

  get scrollTop(): number {
    return this.scrollOffset;
  }

  set scrollTop(value: number) {
    if (!this.hasBox()) {
      return;
    }
    this.scrollOffset = value;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...next: FakeElement[]): void {
    for (const child of this.children) {
      child.parent = null;
    }
    this.children = [];
    for (const child of next) {
      this.appendChild(child);
    }
  }

  addEventListener(): void {}

  removeEventListener(): void {}

  querySelector(selector: string): FakeElement | null {
    const className = selector.startsWith(".") ? selector.slice(1) : selector;
    const walk = (node: FakeElement): FakeElement | null => {
      if (node.className.split(/\s+/).includes(className)) {
        return node;
      }
      for (const child of node.children) {
        const found = walk(child);
        if (found) {
          return found;
        }
      }
      return null;
    };
    for (const child of this.children) {
      const found = walk(child);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private hasBox(): boolean {
    let node: FakeElement | null = this;
    while (node) {
      if (node.hiddenFlag) {
        return false;
      }
      node = node.parent;
    }
    return this.rootWidth() >= 1;
  }

  private rootWidth(): number {
    let node: FakeElement = this;
    while (node.parent) {
      node = node.parent;
    }
    return node.layoutWidth;
  }
}

function installDocument(): void {
  (globalThis as { document?: { createElement: (tag: string) => FakeElement } }).document = {
    createElement: () => new FakeElement()
  };
}

function restoreDocument(): void {
  delete (globalThis as { document?: unknown }).document;
}

function item(id: string): LibraryProjectionItem {
  return {
    id,
    sourceId: "s1",
    fileName: `${id}.mp4`,
    fullPath: null,
    relativePath: `${id}.mp4`,
    playCount: 0,
    lastPlayedUtcMs: null,
    lastWriteTimeUtcMs: null,
    durationSeconds: 10,
    mediaType: "video",
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: null,
    integratedLoudness: null,
    tags: [],
    hasThumbnail: false,
    thumbnailVersion: null,
    thumbnailWidth: null,
    thumbnailHeight: null
  };
}

function scroller(container: FakeElement): FakeElement {
  const scroll = container.querySelector(".library-grid-scroll");
  if (!scroll) {
    throw new Error("missing scroller");
  }
  return scroll;
}

describe("libraryGridController empty scroll reset", () => {
  afterEach(() => {
    restoreDocument();
  });

  it("scrolls an empty reset to the top while the scroller still has a box", () => {
    installDocument();
    const container = new FakeElement();
    container.layoutWidth = 800;
    const grid = createLibraryGridController(container as unknown as HTMLElement, "http://localhost");
    grid.setBrowseContent({ visibleItems: [item("a"), item("b")], searchQuery: "" });
    const scroll = scroller(container);
    scroll.scrollTop = 400;

    grid.setBrowseContent({ visibleItems: [], searchQuery: "", resetScroll: true });

    expect(scroll.scrollTop).toBe(0);
    grid.destroy();
  });

  it("keeps an empty reset that cannot move the hidden scroller until rows are shown again", () => {
    installDocument();
    const container = new FakeElement();
    container.layoutWidth = 800;
    const grid = createLibraryGridController(container as unknown as HTMLElement, "http://localhost");
    grid.setBrowseContent({ visibleItems: [item("a"), item("b")], searchQuery: "" });
    const scroll = scroller(container);
    scroll.scrollTop = 400;

    container.layoutWidth = 0;
    grid.setBrowseContent({ visibleItems: [], searchQuery: "gone", resetScroll: true });
    container.layoutWidth = 800;
    grid.flushDeferredLayout();
    grid.setBrowseContent({
      visibleItems: [item("a"), item("b")],
      searchQuery: "",
      resetScroll: false
    });

    expect(scroll.scrollTop).toBe(0);
    grid.destroy();
  });

  it("leaves the scroll position when an empty reload did not ask to reset", () => {
    installDocument();
    const container = new FakeElement();
    container.layoutWidth = 800;
    const grid = createLibraryGridController(container as unknown as HTMLElement, "http://localhost");
    grid.setBrowseContent({ visibleItems: [item("a")], searchQuery: "" });
    const scroll = scroller(container);
    scroll.scrollTop = 400;

    grid.setBrowseContent({ visibleItems: [], searchQuery: "", resetScroll: false });

    expect(scroll.scrollTop).toBe(400);
    grid.destroy();
  });
});
