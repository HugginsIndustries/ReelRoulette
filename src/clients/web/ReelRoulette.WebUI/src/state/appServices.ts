import { computed, type ReadonlySignal } from "@preact/signals";
import { getClientId, getClientType, getDeviceName, getSessionId } from "../api/coreApi";
import { unauthorizedLogText } from "../api/serverRequest";
import { createDialogs, type Dialogs } from "../dialogs/dialogs";
import { createFilterDialog, type FilterDialog } from "../filter/filterDialog";
import { createLibrary, type Library } from "../library/library";
import { createNotifications, type Notifications } from "../notifications/notifications";
import { createPanelHost, type PanelHost } from "../panel/panelHost";
import { createAmbient, type Ambient } from "../playback/ambient";
import { createAutoPause } from "../playback/autoPause";
import { createPlayer, type Player } from "../playback/player";
import { createStageFullscreen, type StageFullscreen } from "../playback/stageFullscreen";
import { createSettings, type Settings } from "../settings/settings";
import { createStatsTab, type StatsTab } from "../stats/statsTab";
import { createTagCatalog } from "../tags/tagCatalog";
import { createTagEditor, type TagEditor } from "../tags/tagEditor";
import type { RuntimeConfig } from "../types/runtimeConfig";
import { createAppApi, type AppApi } from "./appApi";
import { createAppStore, type AppStore } from "./appStore";
import { createDeviceStore } from "./deviceStore";
import { createPlayerIndicator, type LastingState } from "./lastingStates";
import { createServerConnection, type ServerConnection } from "./serverConnection";

/** Whether the Filter and Tags tabs hold unsaved changes, which their tab icons and the panel button mark with a dot. */
export interface UnsavedTabs {
  filter: boolean;
  tags: boolean;
}

/**
 * One page's runtime config, shared state, server requests, in-app dialogs, server connection, player, ambient mode's
 * glow, fullscreen, side panel, the panel's library, filter, tag editor, and stats tabs, and the settings its Settings
 * tab sets, with Auto-Pause pausing the player as its mode says while the panel and Auto Tag cover it.
 */
export interface AppServices {
  config: RuntimeConfig;
  store: AppStore;
  api: AppApi;
  dialogs: Dialogs;
  connection: ServerConnection;
  player: Player;
  /** Ambient mode's glow behind the player, which the Settings tab turns on and off and tunes. */
  ambient: Ambient;
  fullscreen: StageFullscreen;
  panel: PanelHost;
  library: Library;
  filterDialog: FilterDialog;
  tagEditor: TagEditor;
  statsTab: StatsTab;
  /** Whether the Filter and Tags tabs hold unsaved changes, which the tabs' dots and the panel button's dot both show. */
  unsaved: ReadonlySignal<UnsavedTabs>;
  /** The lasting state the player's indicator shows, or null. */
  indicator: ReadonlySignal<LastingState | null>;
  /** The one-off messages' popups and the list behind the player's bell. */
  notifications: Notifications;
  /** The Settings tab's settings that nothing else keeps. */
  settings: Settings;
}

export function createAppServices(config: RuntimeConfig): AppServices {
  const device = createDeviceStore(localStorage);
  const api = createAppApi(config.apiBaseUrl, {
    onUnauthorized(route) {
      store.pairingRequired.value = true;
      // The one `last.log` line for a 401, whichever request it answered.
      store.relayStatus(unauthorizedLogText(route));
    }
  });
  const store = createAppStore({
    identity: {
      clientId: getClientId(),
      sessionId: getSessionId(),
      clientType: getClientType(),
      deviceName: getDeviceName()
    },
    storage: localStorage,
    device,
    relay(level, message) {
      void api.relayLog(level, message);
    }
  });
  const fullscreen = createStageFullscreen();
  const notifications = createNotifications({
    relay: (logText) => store.relayStatus(logText),
    device,
    inFullscreen: fullscreen.active
  });
  const dialogs = createDialogs({
    relayStatus: (logText) => store.relayStatus(logText),
    record: (message) => notifications.record(message)
  });
  const connection = createServerConnection({
    sseUrl: config.sseUrl,
    pairToken: config.pairToken,
    store,
    api,
    dialogs,
    notifications
  });
  const panel = createPanelHost({ device });
  // The panel opening closes the list behind the bell, leaving focus where the panel put it.
  panel.isOpen.subscribe((open) => {
    if (open) {
      notifications.closeList();
    }
  });
  const player = createPlayer({ apiBaseUrl: config.apiBaseUrl, store, device, api, connection, dialogs, notifications });
  // After the player, so the player handles an item-state event before the library does.
  const library = createLibrary({ config, store, api, connection, player, dialogs, notifications, panel, device });
  // The tag catalog the Filter and Tags tabs load, which the Stats tab orders a file's tags by.
  const tagCatalog = createTagCatalog({ api, connection });
  const filterDialog = createFilterDialog({ store, api, connection, library, panel, device, dialogs, notifications, tagCatalog });
  const tagEditor = createTagEditor({
    store,
    api,
    connection,
    library,
    filter: filterDialog,
    device,
    localStorage,
    dialogs,
    notifications,
    tagCatalog
  });
  const statsTab = createStatsTab({ store, api, connection, tagCatalog });
  const settings = createSettings({ device });
  const ambient = createAmbient({
    enabled: settings.ambient,
    tuning: settings.ambientTuning,
    current: store.current,
    attemptId: store.playAttemptId,
    failed: player.mediaFailed
  });
  createAutoPause({ mode: settings.autoPauseMode, panel, overPage: tagEditor.autoTagOpen, player });
  panel.connectTabs({
    library: {
      enter: () => library.open(),
      leave() {
        library.close();
        return true;
      }
    },
    filter: {
      enter: () => void filterDialog.open(),
      leave() {
        filterDialog.close();
        return true;
      }
    },
    tags: {
      enter: () => tagEditor.open(),
      leave() {
        tagEditor.close();
        return true;
      }
    },
    stats: {
      enter: () => statsTab.open(),
      leave() {
        statsTab.close();
        return true;
      }
    },
    // Settings load nothing and apply as they change, so there is nothing to keep.
    settings: {
      enter() {},
      leave: () => true
    }
  });
  // A panel remembered open starts its tab once the server has passed or failed the compatibility check, or turned out
  // to have no library, so the Library tab can say why.
  connection.on("serverReady", () => panel.startRememberedTab());
  store.compatibilityBlocked.subscribe((blocked) => {
    if (blocked) {
      panel.startRememberedTab();
    }
  });
  store.noLibrary.subscribe((noLibrary) => {
    if (noLibrary) {
      panel.startRememberedTab();
    }
  });
  return {
    config,
    store,
    api,
    dialogs,
    connection,
    player,
    ambient,
    fullscreen,
    panel,
    library,
    filterDialog,
    tagEditor,
    statsTab,
    unsaved: computed(() => ({
      filter: filterDialog.view.value?.unsaved ?? false,
      tags: tagEditor.view.value?.savePending ?? false
    })),
    indicator: createPlayerIndicator(store),
    notifications,
    settings
  };
}
