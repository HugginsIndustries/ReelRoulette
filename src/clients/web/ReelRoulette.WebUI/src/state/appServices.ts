import { computed, signal, type ReadonlySignal } from "@preact/signals";
import { getClientId, getClientType, getDeviceName, getSessionId } from "../api/coreApi";
import { unauthorizedLogText } from "../api/serverRequest";
import { createDialogs, type Dialogs } from "../dialogs/dialogs";
import { createFilterDialog, type FilterDialog } from "../filter/filterDialog";
import { createLibrary, type Library } from "../library/library";
import { createPanelHost, type PanelHost } from "../panel/panelHost";
import { createAutoPause, DEFAULT_AUTO_PAUSE_MODE, type AutoPauseMode } from "../playback/autoPause";
import { createPlayer, type Player } from "../playback/player";
import { createStageFullscreen, type StageFullscreen } from "../playback/stageFullscreen";
import { createTagEditor, type TagEditor } from "../tags/tagEditor";
import type { RuntimeConfig } from "../types/runtimeConfig";
import { createAppApi, type AppApi } from "./appApi";
import { createAppStore, type AppStore } from "./appStore";
import { createDeviceStore } from "./deviceStore";
import { createServerConnection, type ServerConnection } from "./serverConnection";

/** Whether the Filter and Tags tabs hold unsaved changes, which their tab icons and the panel button mark with a dot. */
export interface UnsavedTabs {
  filter: boolean;
  tags: boolean;
}

/**
 * One page's runtime config, shared state, server requests, in-app dialogs, server connection, player, fullscreen,
 * side panel, and the panel's library, filter, and tag editor tabs, with Auto-Pause pausing the player as the panel
 * and Auto Tag cover it.
 */
export interface AppServices {
  config: RuntimeConfig;
  store: AppStore;
  api: AppApi;
  dialogs: Dialogs;
  connection: ServerConnection;
  player: Player;
  fullscreen: StageFullscreen;
  panel: PanelHost;
  library: Library;
  filterDialog: FilterDialog;
  tagEditor: TagEditor;
  /** Whether the Filter and Tags tabs hold unsaved changes, which the tabs' dots and the panel button's dot both show. */
  unsaved: ReadonlySignal<UnsavedTabs>;
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
  const dialogs = createDialogs({ relayStatus: (logText) => store.relayStatus(logText) });
  const connection = createServerConnection({
    sseUrl: config.sseUrl,
    pairToken: config.pairToken,
    store,
    api,
    dialogs
  });
  const panel = createPanelHost({ device });
  const player = createPlayer({ apiBaseUrl: config.apiBaseUrl, store, api, connection, dialogs });
  // After the player, so the player handles an item-state event before the library does.
  const library = createLibrary({ config, store, api, connection, player, dialogs, panel, device });
  const filterDialog = createFilterDialog({ store, api, connection, library, panel, device, dialogs });
  const tagEditor = createTagEditor({ store, api, connection, library, filter: filterDialog, device, localStorage, dialogs });
  // Responsive until the Settings tab can change it.
  createAutoPause({ mode: signal<AutoPauseMode>(DEFAULT_AUTO_PAUSE_MODE), panel, overPage: tagEditor.autoTagOpen, player });
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
    }
  });
  // A panel remembered open starts its tab once the server has passed or failed the compatibility check.
  connection.on("serverReady", () => panel.startRememberedTab());
  store.compatibilityBlocked.subscribe((blocked) => {
    if (blocked) {
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
    fullscreen: createStageFullscreen(),
    panel,
    library,
    filterDialog,
    tagEditor,
    unsaved: computed(() => ({
      filter: filterDialog.view.value?.unsaved ?? false,
      tags: tagEditor.view.value?.savePending ?? false
    }))
  };
}
