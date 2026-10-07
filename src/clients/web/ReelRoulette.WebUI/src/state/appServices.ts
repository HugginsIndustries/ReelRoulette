import { getClientId, getClientType, getDeviceName, getSessionId } from "../api/coreApi";
import type { RuntimeConfig } from "../types/runtimeConfig";
import { createAppApi, type AppApi } from "./appApi";
import { createAppStore, type AppStore } from "./appStore";
import { createServerConnection, type ServerConnection } from "./serverConnection";

/** One page's runtime config, shared state, server requests, and server connection. */
export interface AppServices {
  config: RuntimeConfig;
  store: AppStore;
  api: AppApi;
  connection: ServerConnection;
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
  return { config, store, api, connection };
}
