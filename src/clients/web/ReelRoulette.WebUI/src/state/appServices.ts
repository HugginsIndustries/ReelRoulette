import { getClientId, getClientType, getDeviceName, getSessionId } from "../api/coreApi";
import { createPlayer, type Player } from "../playback/player";
import { createStageFullscreen, type StageFullscreen } from "../playback/stageFullscreen";
import type { RuntimeConfig } from "../types/runtimeConfig";
import { createAppApi, type AppApi } from "./appApi";
import { createAppStore, type AppStore } from "./appStore";
import { createServerConnection, type ServerConnection } from "./serverConnection";

/** One page's runtime config, shared state, server requests, server connection, player, and fullscreen. */
export interface AppServices {
  config: RuntimeConfig;
  store: AppStore;
  api: AppApi;
  connection: ServerConnection;
  player: Player;
  fullscreen: StageFullscreen;
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
  const connection = createServerConnection({
    sseUrl: config.sseUrl,
    pairToken: config.pairToken,
    store,
    api
  });
  const player = createPlayer({ apiBaseUrl: config.apiBaseUrl, store, api, connection });
  return { config, store, api, connection, player, fullscreen: createStageFullscreen() };
}
