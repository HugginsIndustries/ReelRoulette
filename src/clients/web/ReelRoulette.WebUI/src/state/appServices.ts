import { getClientId, getClientType, getDeviceName, getSessionId } from "../api/coreApi";
import { createDialogs, type Dialogs } from "../dialogs/dialogs";
import { createFilterDialog, type FilterDialog } from "../filter/filterDialog";
import { createLibrary, type Library } from "../library/library";
import { createPlayer, type Player } from "../playback/player";
import { createStageFullscreen, type StageFullscreen } from "../playback/stageFullscreen";
import { createTagEditor, type TagEditor } from "../tags/tagEditor";
import type { RuntimeConfig } from "../types/runtimeConfig";
import { createAppApi, type AppApi } from "./appApi";
import { createAppStore, type AppStore } from "./appStore";
import { createServerConnection, type ServerConnection } from "./serverConnection";

/**
 * One page's runtime config, shared state, server requests, in-app dialogs, server connection, player, fullscreen,
 * library, filter dialog, and tag editor.
 */
export interface AppServices {
  config: RuntimeConfig;
  store: AppStore;
  api: AppApi;
  dialogs: Dialogs;
  connection: ServerConnection;
  player: Player;
  fullscreen: StageFullscreen;
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
  const player = createPlayer({ apiBaseUrl: config.apiBaseUrl, store, api, connection });
  // After the player, so the player handles an item-state event before the library does.
  const library = createLibrary({ config, store, api, connection, player });
  const filterDialog = createFilterDialog({ store, api, connection, library, storage: sessionStorage, dialogs });
  const tagEditor = createTagEditor({ store, api, connection, library, player, sessionStorage, localStorage, dialogs });
  return { config, store, api, dialogs, connection, player, fullscreen: createStageFullscreen(), library, filterDialog, tagEditor };
}
