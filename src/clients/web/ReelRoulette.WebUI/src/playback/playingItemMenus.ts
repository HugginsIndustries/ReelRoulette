import { BULK_FLAG_ACTIONS, summarizeLoaded, type BulkTarget } from "../library/bulkActions";
import type { FileLocation } from "../library/fileLocation";
import type { Library } from "../library/library";
import type { LibraryProjectionItem } from "../library/libraryProjectionModel";
import type { PanelHost } from "../panel/panelHost";
import type { PlayerRating } from "../rating/playerRating";
import type { AppStore, PlayingItem } from "../state/appStore";
import type { ContextMenu, ContextMenuView, MenuGroups, MenuItem } from "../ui/menuModel";
import type { WindowPoint } from "../ui/placement";
import { playingFileName } from "./nowPlaying";
import type { Player } from "./player";
import type { PlayerControls } from "./playerControls";

/**
 * The menus on the playing item: the player's picture's and its scrub bar's, the header's now-playing name's, and the
 * Stats tab's file name's and path's. Each works as the controls it repeats do, and closes when another item plays, as
 * the rating's stars do, so none acts on an item that has gone.
 */
export interface PlayingItemMenus {
  /**
   * The player's picture's menu, at `point`, once the playing item's playback stats are known: Add to or Remove from
   * favorites and the blacklist, as the player's buttons do; Rate…, which opens the player's stars, Edit tags…, which
   * shows the Tags tab on the item, Show stats, and Clear playback stats…, disabled with its reason while the item has
   * none to clear; Copy name, Copy path, and Show in File Manager; and Delete file…, held over the player as
   * `showOverPlayer` holds it. With nothing playing, nothing opens.
   */
  openPlayerMenu(point: WindowPoint): Promise<void>;
  /**
   * Opens a menu over the player at `point`, as its picture's and its scrub bar's are, which closes when another item
   * plays. The controls stay while it is open, and their countdown starts again as it closes, showing them only when
   * the user closed it.
   */
  showOverPlayer(point: WindowPoint, groups: MenuGroups): void;
  /**
   * The header's now-playing name's menu: Show stats, then Copy name, Copy path, and Show in File Manager, or null
   * while nothing plays.
   */
  nameGroups(): MenuGroups | null;
  /** The Stats tab's file name's and path's menu: Copy name, Copy path, and Show in File Manager, or null while nothing plays. */
  fileGroups(): MenuGroups | null;
  /** Opens a menu on the playing item, which closes when another item plays. */
  show(view: ContextMenuView): void;
}

export interface PlayingItemMenusOptions {
  store: Pick<AppStore, "current">;
  player: Pick<Player, "favorite" | "blacklisted" | "toggleFavorite" | "toggleBlacklist">;
  playerRating: Pick<PlayerRating, "openPopover">;
  playerControls: Pick<PlayerControls, "hold">;
  panel: Pick<PanelHost, "showTab">;
  /** The playing item's read, and Edit tags…, Clear playback stats…, and Delete file…, from the library's menus. */
  library: Pick<Library, "bulk" | "readMenuItem">;
  fileLocation: Pick<FileLocation, "menuItems">;
  contextMenu: ContextMenu;
}

export function createPlayingItemMenus(options: PlayingItemMenusOptions): PlayingItemMenus {
  const { store, player, playerRating, playerControls, panel, library, fileLocation, contextMenu } = options;
  /** The player's menu's read of the playing item, which a newer open, another menu, or another item playing drops. */
  let read: AbortController | null = null;
  /** The menu of these that is open, or null. */
  let shown: ContextMenuView | null = null;

  function dropRead(): void {
    read?.abort();
    read = null;
  }

  function show(view: ContextMenuView): void {
    const opened: ContextMenuView = {
      ...view,
      onClose(byUser) {
        if (shown === opened) {
          shown = null;
        }
        view.onClose?.(byUser);
      }
    };
    contextMenu.open(opened);
    shown = opened;
  }

  function showOverPlayer(point: WindowPoint, groups: MenuGroups): void {
    // A close the user made is activity, which shows the controls; one on its own, as when another item plays, isn't.
    show({ point, groups, onClose: (byUser) => playerControls.hold("menu", false, { quietly: !byUser }) });
    playerControls.hold("menu", true);
  }

  const showStats: MenuItem = { label: "Show stats", icon: "bar_chart", onPick: () => void panel.showTab("stats") };

  function fileItems(item: PlayingItem): MenuItem[] {
    return fileLocation.menuItems({ itemId: item.itemId, path: item.id, name: playingFileName(item) });
  }

  /** The favorite or blacklist item the player's button would act as: the remove while `on`, the add otherwise. */
  function flagItem(flag: "favorite" | "blacklist", on: boolean, toggle: () => Promise<void>): MenuItem {
    const action = BULK_FLAG_ACTIONS.find((candidate) => candidate.flag === flag && candidate.value === !on)!;
    return { label: action.label, icon: action.icon, onPick: () => void toggle() };
  }

  /** The player's menu's groups for `item`, whose playback stats `known` gives, or none when its read failed. */
  function playerGroups(item: PlayingItem, known: LibraryProjectionItem | null): MenuGroups {
    const target: BulkTarget = { kind: "item", itemId: item.itemId };
    const { bulk } = library;
    return [
      [
        flagItem("favorite", player.favorite.peek(), player.toggleFavorite),
        flagItem("blacklist", player.blacklisted.peek(), player.toggleBlacklist)
      ],
      [
        { label: "Rate…", icon: "star", onPick: () => playerRating.openPopover() },
        bulk.editTagsItem(target),
        showStats,
        bulk.clearPlaybackStatsItem(target, known && summarizeLoaded([known.id], [known]))
      ],
      fileItems(item),
      [bulk.deleteFilesItem(target)]
    ];
  }

  // Another item playing closes a menu on the one before, and drops the player's menu about to open.
  store.current.subscribe(() => {
    dropRead();
    if (shown) {
      contextMenu.close();
    }
  });
  // Another menu opening drops the player's menu about to open.
  contextMenu.isOpen.subscribe((isOpen) => {
    if (isOpen) {
      dropRead();
    }
  });

  return {
    async openPlayerMenu(point) {
      const item = store.current.peek();
      if (!item?.itemId) {
        return;
      }
      dropRead();
      const request = new AbortController();
      read = request;
      let known: LibraryProjectionItem | null | "unauthorized";
      try {
        known = await library.readMenuItem(item.itemId, request.signal);
      } finally {
        if (read === request) {
          read = null;
        }
      }
      if (request.signal.aborted || known === "unauthorized") {
        return;
      }
      showOverPlayer(point, playerGroups(item, known));
    },

    showOverPlayer,

    nameGroups() {
      const item = store.current.peek();
      return item ? [[showStats], fileItems(item)] : null;
    },

    fileGroups() {
      const item = store.current.peek();
      return item ? [fileItems(item)] : null;
    },

    show
  };
}
