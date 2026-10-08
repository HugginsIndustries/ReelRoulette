import { useLayoutEffect, useRef } from "preact/hooks";
import { useApp } from "./appContext";
import { FilterDialog } from "./FilterDialog";
import { LegacyOverlays } from "./LegacyOverlays";
import { LibraryOverlay } from "./LibraryOverlay";
import { Player } from "./Player";
import { ScreenBoundary } from "./ScreenBoundary";

/**
 * The part of the page that goes fullscreen: the player and the overlays, which stay inside it so they show in
 * fullscreen too.
 */
export function Stage() {
  const { api, fullscreen, library } = useApp();
  const stage = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    fullscreen.attach(stage.current!);
    return () => fullscreen.detach();
  }, []);

  // Escape closes the library overlay when it is open, and otherwise leaves pseudo-fullscreen.
  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (library.isOpen()) {
        library.close();
        return;
      }
      fullscreen.exitPseudo();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div id="fullscreen-stage" class={fullscreen.pseudo.value ? "fullscreen-stage fullscreen-pseudo" : "fullscreen-stage"} ref={stage}>
      <main>
        <ScreenBoundary screen="player" relay={api.relayLog}>
          <Player />
        </ScreenBoundary>
      </main>
      <LegacyOverlays />
      <ScreenBoundary screen="filter" relay={api.relayLog}>
        <FilterDialog />
      </ScreenBoundary>
      <ScreenBoundary screen="library" relay={api.relayLog}>
        <LibraryOverlay />
      </ScreenBoundary>
    </div>
  );
}
