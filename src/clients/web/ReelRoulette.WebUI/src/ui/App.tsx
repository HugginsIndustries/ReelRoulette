import { useLayoutEffect } from "preact/hooks";
import { startApp } from "../app";
import type { AppServices } from "../state/appServices";
import { AppContext } from "./appContext";
import { Header } from "./Header";
import { LegacyStage } from "./LegacyStage";
import { ScreenBoundary } from "./ScreenBoundary";
import { MobileDiagnostics, StatusLine } from "./StatusLine";

/**
 * The page. `app.js` runs the screens in the legacy stage: it starts right after the first render, before the
 * server connection, so its handlers are registered before any server reply arrives.
 */
export function App({ services }: { services: AppServices }) {
  useLayoutEffect(() => {
    startApp(services);
    services.connection.start();
    return () => services.connection.stop();
  }, []);

  const relay = services.api.relayLog;
  return (
    <AppContext.Provider value={services}>
      <ScreenBoundary screen="header" relay={relay}>
        <Header />
      </ScreenBoundary>
      <LegacyStage />
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
      <h1>ReelRoulette WebUI</h1>
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
