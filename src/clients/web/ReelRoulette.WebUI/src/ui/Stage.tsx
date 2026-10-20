import { effect } from "@preact/signals";
import { useLayoutEffect, useRef } from "preact/hooks";
import { listenForShortcuts } from "../keyboard/shortcuts";
import { useApp } from "./appContext";
import { AutoTag } from "./AutoTag";
import { DialogHost } from "./Dialog";
import { NotificationList, Popups } from "./Notifications";
import { Panel } from "./Panel";
import { Player } from "./Player";
import { ScreenBoundary } from "./ScreenBoundary";

/**
 * The part of the page that goes fullscreen: the player with its popups beside it, the side panel with its tabs, Auto
 * Tag, the list behind the player's bell, and the in-app dialogs, which stay inside it so they show in fullscreen too.
 * The panel's side, where it goes, its width, whether the overlay panel covers the player, and pseudo-fullscreen are set
 * on the stage as they change, and whether the player is narrow on the player column, without rendering them again, so
 * dragging the panel's handle doesn't render the player.
 */
export function Stage() {
  const { api, fullscreen, panel, player, audio, settings } = useApp();
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
        element.classList.toggle("fullscreen-pseudo", fullscreen.pseudo.value);
        // The overlay panel covers the player, so popups at the bottom stay at the edge, not above the hidden controls.
        element.classList.toggle("covers-player", panel.mode.value === "overlay" && panel.isOpen.value);
        // A player narrower than 600 px: its indicator sits below the corner buttons.
        playerColumn.current!.classList.toggle("is-narrow", panel.playerNarrow.value);
      }),
    []
  );

  useLayoutEffect(() => {
    panel.attachPlayer(playerColumn.current);
    return () => panel.attachPlayer(null);
  }, []);

  // Escape closes the panel when it is open, leaving focus on the page as the shortcuts do, and otherwise leaves
  // pseudo-fullscreen. While a dialog or Auto Tag is open, Escape is theirs: it closes the top one.
  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (stage.current?.querySelector("dialog[open]")) return;
      if (panel.isOpen.peek()) {
        void panel.close({ byKey: true });
        return;
      }
      fullscreen.exitPseudo();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // The keyboard shortcuts, from any key press the focused element leaves to the page.
  useLayoutEffect(() => listenForShortcuts(document, { player, audio, panel, fullscreen, settings }), []);

  return (
    <div id="fullscreen-stage" class="fullscreen-stage" ref={stage}>
      <main class="player-col" ref={playerColumn}>
        <ScreenBoundary screen="player" relay={api.relayLog}>
          <Player />
        </ScreenBoundary>
        <ScreenBoundary screen="popups" relay={api.relayLog}>
          <Popups />
        </ScreenBoundary>
      </main>
      <ScreenBoundary screen="panel" relay={api.relayLog}>
        <Panel />
      </ScreenBoundary>
      <ScreenBoundary screen="notifications" relay={api.relayLog}>
        <NotificationList />
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
