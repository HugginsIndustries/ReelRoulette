import { useLayoutEffect, useRef } from "preact/hooks";
import { useApp } from "./appContext";
import { LegacyOverlays } from "./LegacyOverlays";
import { Player } from "./Player";
import { ScreenBoundary } from "./ScreenBoundary";

/**
 * The part of the page that goes fullscreen: the player and the overlays, which stay inside it so they show in
 * fullscreen too.
 */
export function Stage() {
  const { api, fullscreen } = useApp();
  const stage = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    fullscreen.attach(stage.current!);
    return () => fullscreen.detach();
  }, []);

  return (
    <div id="fullscreen-stage" class={fullscreen.pseudo.value ? "fullscreen-stage fullscreen-pseudo" : "fullscreen-stage"} ref={stage}>
      <main>
        <ScreenBoundary screen="player" relay={api.relayLog}>
          <Player />
        </ScreenBoundary>
      </main>
      <LegacyOverlays />
    </div>
  );
}
