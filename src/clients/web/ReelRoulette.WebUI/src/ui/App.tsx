import { useLayoutEffect } from "preact/hooks";
import type { AppServices } from "../state/appServices";
import { AppContext } from "./appContext";
import { Header } from "./Header";
import { ScreenBoundary } from "./ScreenBoundary";
import { Stage } from "./Stage";
import { MobileDiagnostics, StatusLine } from "./StatusLine";

/** The page. The server connection starts right after the first render, once the player has its elements. */
export function App({ services }: { services: AppServices }) {
  useLayoutEffect(() => {
    services.connection.start();
    return () => services.connection.stop();
  }, []);

  const relay = services.api.relayLog;
  return (
    <AppContext.Provider value={services}>
      <ScreenBoundary screen="header" relay={relay}>
        <Header />
      </ScreenBoundary>
      <Stage />
      <ScreenBoundary screen="status" relay={relay}>
        <StatusLine />
      </ScreenBoundary>
      <ScreenBoundary screen="diagnostics" relay={relay}>
        <MobileDiagnostics />
      </ScreenBoundary>
    </AppContext.Provider>
  );
}

export function StartupError({ message }: { message: string }) {
  return (
    <main>
      <h1>ReelRoulette</h1>
      <section class="card error">
        <h2>Runtime Configuration Error</h2>
        <p>{message}</p>
        <p>
          {"Provide `window.__REEL_ROULETTE_RUNTIME_CONFIG` before boot, or host a valid `/runtime-config.json`."}
        </p>
      </section>
    </main>
  );
}
