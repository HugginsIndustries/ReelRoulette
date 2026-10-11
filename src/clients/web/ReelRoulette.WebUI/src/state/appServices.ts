import { getClientId, getClientType, getDeviceName, getSessionId } from "../api/coreApi";
import { createDialogs, type Dialogs } from "../dialogs/dialogs";
import { createFilterDialog, type FilterDialog } from "../filter/filterDialog";
import { createLibrary, type Library } from "../library/library";
import { createPanelHost, type PanelHost } from "../panel/panelHost";
import { createPlayer, type Player } from "../playback/player";
import { createStageFullscreen, type StageFullscreen } from "../playback/stageFullscreen";
import { createTagEditor, type TagEditor } from "../tags/tagEditor";
import type { RuntimeConfig } from "../types/runtimeConfig";
import { createAppApi, type AppApi } from "./appApi";
import { createAppStore, type AppStore } from "./appStore";
import { createDeviceStore } from "./deviceStore";
import { createServerConnection, type ServerConnection } from "./serverConnection";

/**
 * One page's runtime config, shared state, server requests, in-app dialogs, server connection, player, fullscreen,
 * side panel, and the panel's library, filter, and tag editor tabs.
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
}

export function createAppServices(config: RuntimeConfig): AppServices {
  const api = createAppApi(config.apiBaseUrl, {
    onUnauthorized() {
      store.pairingRequired.value = true;
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
    relay(level, message) {
      void api.relayLog(level, message);
    }
  });
  const dialogs = createDialogs({ relayStatus: (logText) => store.relayStatus(logText) });
  const connection = createServerConnection({
    sseUrl: config.sseUrl,
    pairToken: config.pairToken,
    store,
    api
  });
  const panel = createPanelHost({ device: createDeviceStore(localStorage) });
  const player = createPlayer({ apiBaseUrl: config.apiBaseUrl, store, api, connection, dialogs });
  // After the player, so the player handles an item-state event before the library does.
  const library = createLibrary({ config, store, api, connection, player, panel });
  const filterDialog = createFilterDialog({ store, api, connection, library, panel, storage: sessionStorage, dialogs });
  const tagEditor = createTagEditor({ store, api, connection, library, player, panel, sessionStorage, localStorage, dialogs });
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
      leave: () => tagEditor.close()
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
    tagEditor
  };
}
