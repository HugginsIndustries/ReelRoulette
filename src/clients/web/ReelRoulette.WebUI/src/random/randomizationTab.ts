import { computed, signal, type ReadonlySignal } from "@preact/signals";
import { requestFailure, requestWithNotice, UnauthorizedError } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import type { Notifications } from "../notifications/notifications";
import { currentRandomPickRequest } from "../playback/randomPick";
import type { StatsCard } from "../stats/statsModel";
import type { AppApi } from "../state/appApi";
import type { AppStore, RandomCycle } from "../state/appStore";
import { isBoolean, type DeviceStore } from "../state/deviceStore";
import { heldBackText } from "../state/lastingStates";
import type { ServerConnection } from "../state/serverConnection";
import type { TagCatalog } from "../tags/tagCatalog";
import type { FieldProblem } from "../validation/fieldValidation";
import { byCategoryProblem, spreadCategories, type RandomOptions } from "./randomOptions";

/** What the cycle card shows: nothing, a message in place of its cards, or its cards. */
export type CycleCardView =
  | { kind: "none" }
  | { kind: "message"; text: string }
  /** Its cards, and whether Shuffle is off, so files can repeat. */
  | { kind: "cards"; cards: StatsCard[]; shuffleOff: boolean };

/** What By category lists: nothing before the catalog loads, why it couldn't load, or the categories with tags. */
export type CategoryListView =
  | { kind: "none" }
  | { kind: "failed"; text: string }
  | { kind: "list"; categories: { id: string; name: string; chosen: boolean }[] };

export interface RandomizationTabView {
  cycle: CycleCardView;
  categories: CategoryListView;
  /** By category's problem: on with no category chosen. */
  byCategoryProblem: FieldProblem | null;
  /** Why Reset now is disabled, its tooltip, or null while it can reset. */
  resetBlockedReason: string | null;
}

/**
 * The panel's Randomization tab: the random pick options, which apply at once and which the store keeps on this
 * device, and the cycle card, which shows this device's Shuffle cycle from each pick's answer. Showing the tab reads
 * the cycle once, and so do Reset now, a change to Remember plays for, and the server becoming ready or asking for a
 * resync while it shows. It loads the tag catalog for By category's list when none has loaded, as it shows and when the
 * server becomes ready or asks for a resync. Nothing loads while the server fails the compatibility check, runs without
 * a library, or asks for pairing, nor once the connection stops, as when the page closes. The cycle card's open state
 * is kept on this device, open until it is closed.
 */
export interface RandomizationTab {
  readonly view: ReadonlySignal<RandomizationTabView>;
  readonly cycleOpen: ReadonlySignal<boolean>;
  /** The tab shows: it reads the cycle and loads the tag catalog when none has loaded. */
  open(): void;
  /** The tab hides. */
  close(): void;
  /** Changes some of the options, which apply at once. */
  setOptions(change: Partial<RandomOptions>): void;
  /** Chooses or unchooses a category for By category, by its id. */
  setCategoryChosen(categoryId: string, chosen: boolean): void;
  /** Opens or closes the cycle card, which this device remembers. */
  setCycleOpen(open: boolean): void;
  /** Clears this device's Shuffle memory on the server, then reads the cycle again. */
  reset(): Promise<void>;
}

export interface RandomizationTabOptions {
  store: AppStore;
  api: Pick<AppApi, "post" | "postJson">;
  connection: Pick<ServerConnection, "on">;
  /** The tag catalog the tabs share, whose categories By category lists. */
  tagCatalog: TagCatalog;
  /** The notice a failed reset shows. */
  dialogs: Pick<Dialogs, "notice">;
  /** The popup that says Reset now cleared the memory. */
  notifications: Pick<Notifications, "notify">;
  /** Where this device remembers whether the cycle card is open. */
  device: DeviceStore;
}

const CYCLE_OPEN_KEY = "randomization.cycleOpen";

/** Reset now's tooltip while the server fails the compatibility check. */
export const RESET_INCOMPATIBLE_REASON = "Cannot reset: server compatibility check failed.";
/** Reset now's tooltip while the server runs without a library. */
export const RESET_NO_LIBRARY_REASON = "Cannot reset: the server is running without a library.";
/** Reset now's tooltip while the server asks for pairing. */
export const RESET_PAIRING_REASON = "Cannot reset: this device isn't paired.";

/** The cycle card's cards: Picked this cycle, Eligible now, and Remaining. */
export function cycleCards(cycle: RandomCycle): StatsCard[] {
  return [
    { label: "Picked this cycle", value: cycle.picked.toLocaleString() },
    { label: "Eligible now", value: cycle.eligible.toLocaleString() },
    { label: "Remaining", value: cycle.remaining.toLocaleString() }
  ];
}

export function createRandomizationTab(options: RandomizationTabOptions): RandomizationTab {
  const { store, api, connection, tagCatalog, dialogs, notifications, device } = options;
  const isOpen = signal(false);
  const cycleOpen = signal(device.read(CYCLE_OPEN_KEY, true, isBoolean));
  /** Why the last cycle read failed, until new numbers come. */
  const cycleFailure = signal<string | null>(null);
  /** Why the tag catalog couldn't load, until it loads. */
  const catalogFailure = signal<string | null>(null);
  /** The connection has stopped, as when the page closes, so nothing loads. */
  let stopped = false;

  const view = computed<RandomizationTabView>(() => {
    const randomOptions = store.randomOptions.value;
    const held = heldBackText(store);
    const pairing = store.pairingRequired.value;
    const cycle = store.randomCycle.value;
    let cycleView: CycleCardView = { kind: "none" };
    if (pairing) {
      cycleView = { kind: "none" };
    } else if (held !== null) {
      cycleView = { kind: "message", text: held };
    } else if (cycleFailure.value !== null) {
      cycleView = { kind: "message", text: cycleFailure.value };
    } else if (cycle) {
      cycleView = { kind: "cards", cards: cycleCards(cycle), shuffleOff: !randomOptions.shuffle };
    }

    const listed = spreadCategories(tagCatalog.catalog.value);
    const categories: CategoryListView = listed
      ? { kind: "list", categories: listed.map((category) => ({ ...category, chosen: randomOptions.spreadCategoryIds.includes(category.id) })) }
      : catalogFailure.value !== null
        ? { kind: "failed", text: catalogFailure.value }
        : { kind: "none" };

    const resetBlockedReason = store.compatibilityBlocked.value
      ? RESET_INCOMPATIBLE_REASON
      : store.noLibrary.value
        ? RESET_NO_LIBRARY_REASON
        : pairing
          ? RESET_PAIRING_REASON
          : null;

    return { cycle: cycleView, categories, byCategoryProblem: byCategoryProblem(randomOptions, listed), resetBlockedReason };
  });

  function canLoad(): boolean {
    return !stopped && isOpen.peek() && !store.heldBack.peek() && !store.pairingRequired.peek();
  }

  async function loadCycle(): Promise<void> {
    if (!canLoad()) {
      return;
    }
    try {
      store.randomCycle.value = (await api.postJson("/api/random/cycle", currentRandomPickRequest(store))) as RandomCycle;
    } catch (error) {
      // A 401's pairing prompt is the only thing to act on.
      if (error instanceof UnauthorizedError) {
        return;
      }
      const { text, logText } = requestFailure("Shuffle cycle load failed", error);
      cycleFailure.value = text;
      store.relayStatus(logText);
    }
  }

  async function loadCatalog(): Promise<void> {
    if (!canLoad() || tagCatalog.catalog.peek()) {
      return;
    }
    try {
      await tagCatalog.ensureLoaded();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return;
      }
      const { text, logText } = requestFailure("Tag load failed", error);
      catalogFailure.value = text;
      store.relayStatus(logText);
    }
  }

  // New numbers, from a pick's answer or a cycle read, replace a failed read's message.
  store.randomCycle.subscribe(() => {
    cycleFailure.value = null;
  });
  tagCatalog.catalog.subscribe((catalog) => {
    if (catalog) {
      catalogFailure.value = null;
    }
  });
  // Remember plays for decides which picks count, so the cycle is read again when it changes while the tab shows.
  let rememberedDays = store.randomOptions.peek().rememberPlaysForDays;
  store.randomOptions.subscribe((randomOptions) => {
    if (randomOptions.rememberPlaysForDays !== rememberedDays) {
      rememberedDays = randomOptions.rememberPlaysForDays;
      void loadCycle();
    }
  });
  /** Reads the cycle and loads the tag catalog again, which comes to nothing while the tab is hidden. */
  function reload(): void {
    void loadCycle();
    void loadCatalog();
  }
  store.pairingRequired.subscribe((required) => {
    if (!required) {
      reload();
    }
  });
  // A server that becomes ready, or asks for a resync, as after a restart, which clears its memory and drops the tag
  // catalog, has new numbers and tags for a tab that shows.
  connection.on("serverReady", reload);
  connection.on("resyncRequired", reload);
  connection.on("stopped", () => {
    stopped = true;
  });

  return {
    view,
    cycleOpen,
    open() {
      isOpen.value = true;
      void loadCycle();
      void loadCatalog();
    },
    close() {
      isOpen.value = false;
    },
    setOptions(change) {
      store.setRandomOptions({ ...store.randomOptions.peek(), ...change });
    },
    setCategoryChosen(categoryId, chosen) {
      const ids = store.randomOptions.peek().spreadCategoryIds.filter((id) => id !== categoryId);
      store.setRandomOptions({ ...store.randomOptions.peek(), spreadCategoryIds: chosen ? [...ids, categoryId] : ids });
    },
    setCycleOpen(open) {
      if (open === cycleOpen.peek()) {
        return;
      }
      cycleOpen.value = open;
      device.write(CYCLE_OPEN_KEY, open);
    },
    async reset() {
      if (view.peek().resetBlockedReason !== null) {
        return;
      }
      const reset = await requestWithNotice(dialogs, "Shuffle reset failed", () => api.post("/api/random/reset", { clientId: store.identity.clientId }));
      if (reset) {
        notifications.notify({ kind: "actions", text: "Shuffle memory cleared.", key: "shuffle" });
        void loadCycle();
      }
    }
  };
}
