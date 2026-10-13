import { effect } from "@preact/signals";
import { useLayoutEffect } from "preact/hooks";
import type { AppServices } from "../state/appServices";
import { AppContext } from "./appContext";
import { Header } from "./Header";
import { ScreenBoundary } from "./ScreenBoundary";
import { Stage } from "./Stage";

/** The page. The server connection starts right after the first render, once the player has its elements. */
export function App({ services }: { services: AppServices }) {
  useLayoutEffect(() => {
    services.connection.start();
    return () => services.connection.stop();
  }, []);

  // On a phone on its side the page shows only the player: the stylesheet hides the header by the body's class.
  useLayoutEffect(() => {
    const stop = effect(() => {
      document.body.classList.toggle("short-screen", services.panel.shortScreen.value);
    });
    return () => {
      stop();
      document.body.classList.remove("short-screen");
    };
  }, []);

  const relay = services.api.relayLog;
  return (
    <AppContext.Provider value={services}>
      <ScreenBoundary screen="header" relay={relay}>
        <Header />
      </ScreenBoundary>
      <Stage />
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
