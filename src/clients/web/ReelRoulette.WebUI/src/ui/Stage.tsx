import { effect } from "@preact/signals";
import { useLayoutEffect, useRef } from "preact/hooks";
import { useApp } from "./appContext";
import { DialogHost } from "./Dialog";
import { Panel } from "./Panel";
import { Player } from "./Player";
import { ScreenBoundary } from "./ScreenBoundary";

/**
 * The part of the page that goes fullscreen: the player, the side panel with its tabs, and the in-app dialogs, which
 * stay inside it so they show in fullscreen too. The panel's side, where it goes, and its width are set on the stage
 * as they change, without rendering it again, so dragging the panel's handle doesn't render the player.
 */
export function Stage() {
  const { api, fullscreen, panel } = useApp();
  const stage = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    fullscreen.attach(stage.current!);
    return () => fullscreen.detach();
  }, []);

  useLayoutEffect(
    () =>
      effect(() => {
        const element = stage.current!;
        element.dataset.side = panel.side.value;
        element.dataset.panelMode = panel.mode.value;
        element.style.setProperty("--panel-width", `${panel.width.value}px`);
      }),
    []
  );

  // Escape closes the panel when it is open, and otherwise leaves pseudo-fullscreen. While a dialog is open, Escape is
  // the dialog's: it closes the top one.
  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (stage.current?.querySelector("dialog[open]")) return;
      if (panel.isOpen.peek()) {
        void panel.close();
        return;
      }
      fullscreen.exitPseudo();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div id="fullscreen-stage" class={fullscreen.pseudo.value ? "fullscreen-stage fullscreen-pseudo" : "fullscreen-stage"} ref={stage}>
      <main class="player-col">
        <ScreenBoundary screen="player" relay={api.relayLog}>
          <Player />
        </ScreenBoundary>
      </main>
      <ScreenBoundary screen="panel" relay={api.relayLog}>
        <Panel />
      </ScreenBoundary>
      <ScreenBoundary screen="dialogs" relay={api.relayLog}>
        <DialogHost />
      </ScreenBoundary>
    </div>
  );
}
