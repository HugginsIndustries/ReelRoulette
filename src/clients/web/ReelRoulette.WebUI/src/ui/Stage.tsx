import { effect } from "@preact/signals";
import { useLayoutEffect, useRef } from "preact/hooks";
import { useApp } from "./appContext";
import { AutoTag } from "./AutoTag";
import { DialogHost } from "./Dialog";
import { Panel } from "./Panel";
import { Player } from "./Player";
import { ScreenBoundary } from "./ScreenBoundary";

/**
 * The part of the page that goes fullscreen: the player, the side panel with its tabs, Auto Tag, and the in-app
 * dialogs, which stay inside it so they show in fullscreen too. The panel's side, where it goes, and its width are set on the stage
 * as they change, and whether the player is narrow on the player column, without rendering them again, so dragging the
 * panel's handle doesn't render the player.
 */
export function Stage() {
  const { api, fullscreen, panel } = useApp();
  const stage = useRef<HTMLDivElement>(null);
  const playerColumn = useRef<HTMLElement>(null);

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
        // A player narrower than 600 px: its indicator sits below the corner buttons.
        playerColumn.current!.classList.toggle("is-narrow", panel.playerNarrow.value);
      }),
    []
  );

  useLayoutEffect(() => {
    panel.attachPlayer(playerColumn.current);
    return () => panel.attachPlayer(null);
  }, []);

  // Escape closes the panel when it is open, and otherwise leaves pseudo-fullscreen. While a dialog or Auto Tag is open,
  // Escape is theirs: it closes the top one.
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
      <main class="player-col" ref={playerColumn}>
        <ScreenBoundary screen="player" relay={api.relayLog}>
          <Player />
        </ScreenBoundary>
      </main>
      <ScreenBoundary screen="panel" relay={api.relayLog}>
        <Panel />
      </ScreenBoundary>
      <ScreenBoundary screen="autotag" relay={api.relayLog}>
        <AutoTag />
      </ScreenBoundary>
      <ScreenBoundary screen="dialogs" relay={api.relayLog}>
        <DialogHost />
      </ScreenBoundary>
    </div>
  );
}
