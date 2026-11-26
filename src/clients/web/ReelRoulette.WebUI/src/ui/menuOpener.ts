import { listenForLongPress } from "./longPress";
import type { ContextMenu } from "./menuModel";
import type { WindowPoint } from "./placement";

/**
 * What a long press leaves alone inside a surface, so it stays free for its own press: buttons, which keep their
 * tooltips, but those the surface counts as part of it (`pressOn`), drag handles, the rating's stars, and the panel's
 * resize handle.
 */
const LONG_PRESS_SKIPS = "button, .drag-handle, .rating, .panel-handle";

/** The input types that take typed text. */
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "number"]);

/** Whether `target` is a text field, which keeps the browser's own menu for copy, paste, and spell check. */
export function takesText(target: EventTarget | null): boolean {
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type));
}

/**
 * Opens the context menus of `contextMenu`'s surfaces, in place of the browser's own menu, which shows only in text
 * fields. A mouse's right-click anywhere on a surface opens its menu at the pointer, and a right-click where no menu
 * exists opens nothing. A long press with a finger or a pen opens it where the press began, except on what
 * `LONG_PRESS_SKIPS` leaves alone, and the click it ends with is used up before anything hears it, so it never also
 * presses, plays, or picks what it lands on, such as the menu's first item under the finger.
 */
export function listenForMenus(contextMenu: ContextMenu, root: Document = document): () => void {
  const press = listenForLongPress<(point: WindowPoint) => void>(root, {
    pressAt(target) {
      const hit = contextMenu.surfaceAt(target);
      if (!hit) {
        return null;
      }
      const skipped = target.closest(LONG_PRESS_SKIPS);
      const partOfSurface = !!skipped && !!hit.pressOn && skipped.matches(hit.pressOn);
      return skipped && hit.element.contains(skipped) && !partOfSurface ? null : hit.open;
    },
    onLongPress: (open, point) => open(point)
  });

  function onContextMenu(event: MouseEvent): void {
    if (takesText(event.target)) {
      return;
    }
    event.preventDefault();
    // A finger's or a pen's long press opens its menu itself, so the right-click it sends, as Chrome on Android does,
    // opens nothing more.
    if (press.byMouse() && event.target instanceof Element) {
      contextMenu.surfaceAt(event.target)?.open({ x: event.clientX, y: event.clientY });
    }
  }

  function onClick(event: MouseEvent): void {
    if (press.takeClick()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  root.addEventListener("contextmenu", onContextMenu, true);
  root.addEventListener("click", onClick, true);
  return () => {
    press.dispose();
    root.removeEventListener("contextmenu", onContextMenu, true);
    root.removeEventListener("click", onClick, true);
  };
}
