import { computed, type ReadonlySignal } from "@preact/signals";
import { createControlAccess, type ControlAccess } from "../api/controlAccess";
import { getClientId, getClientType, getDeviceName, getSessionId } from "../api/coreApi";
import { unauthorizedLogText } from "../api/serverRequest";
import { createDialogs, type Dialogs } from "../dialogs/dialogs";
import { createFilterDialog, type FilterDialog } from "../filter/filterDialog";
import { createLibrary, type Library } from "../library/library";
import { createNotifications, type Notifications } from "../notifications/notifications";
import { createPanelHost, type PanelHost } from "../panel/panelHost";
import { createAmbient, type Ambient } from "../playback/ambient";
import { createAudioStage, type AudioStage } from "../playback/audioStage";
import { createAutoPause } from "../playback/autoPause";
import { createCompression, type Compression } from "../playback/compression";
import { createLoudnessNormalization, type LoudnessNormalization } from "../playback/loudnessNormalization";
import { createPlayer, type Player } from "../playback/player";
import { createPlayerControls, type PlayerControls } from "../playback/playerControls";
import { createItemRatings } from "../rating/itemRatings";
import { createPlayerRating, type PlayerRating } from "../rating/playerRating";
import { createStageFullscreen, type StageFullscreen } from "../playback/stageFullscreen";
import { createRandomizationTab, type RandomizationTab } from "../random/randomizationTab";
import { createSettings, type Settings } from "../settings/settings";
import { createLibraryBaseline } from "../stats/libraryBaseline";
import { createStatsTab, type StatsTab } from "../stats/statsTab";
import { createTagCatalog } from "../tags/tagCatalog";
import { createTagEditor, type TagEditor } from "../tags/tagEditor";
import type { RuntimeConfig } from "../types/runtimeConfig";
import { createContextMenu, type ContextMenu } from "../ui/menuModel";
import { createAppApi, type AppApi } from "./appApi";
import { createAppStore, type AppStore } from "./appStore";
import { browserStorage, createDeviceStore } from "./deviceStore";
import { createPlayerIndicator, type LastingState } from "./lastingStates";
import { createServerConnection, type ServerConnection } from "./serverConnection";

/** Whether the Filter and Tags tabs hold unsaved changes, which their tab icons and the panel button mark with a dot. */
export interface UnsavedTabs {
  filter: boolean;
  tags: boolean;
}

/**
 * One page's runtime config, shared state, server requests, in-app dialogs, admin access, server connection, player,
 * when its controls show, its sound and loudness normalization and compression, ambient mode's glow, fullscreen, side
 * panel, the panel's library, tag editor, stats, filter, and randomization tabs, and the settings its Settings tab sets,
 * with Auto-Pause pausing the player as its mode says while the panel and Auto Tag cover it.
 */
export interface AppServices {
  config: RuntimeConfig;
  store: AppStore;
  api: AppApi;
  dialogs: Dialogs;
  /** Whether this device may do admin actions, and the control-token prompt that asks when it may not. */
  controlAccess: ControlAccess;
  connection: ServerConnection;
  player: Player;
  /** Whether the player's controls show, as Hide player controls and its settings say. */
  playerControls: PlayerControls;
  /** The playing item's rating, which the player's star, its popover, and the rating keys show and set. */
  playerRating: PlayerRating;
  /** The player's sound: the volume, Mute, and Enhanced audio's gain stage. */
  audio: AudioStage;
  /** Loudness normalization and its settings, whose gain the audio stage applies. */
  normalization: LoudnessNormalization;
  /** Compression and its settings, whose compressor the audio stage applies. */
  compression: Compression;
  /** Ambient mode's glow behind the player, which the Settings tab turns on and off and tunes. */
  ambient: Ambient;
  fullscreen: StageFullscreen;
  panel: PanelHost;
  library: Library;
  filterDialog: FilterDialog;
  tagEditor: TagEditor;
  statsTab: StatsTab;
  randomization: RandomizationTab;
  /** Whether the Filter and Tags tabs hold unsaved changes, which the tabs' dots and the panel button's dot both show. */
  unsaved: ReadonlySignal<UnsavedTabs>;
  /** The lasting state the player's indicator shows, or null. */
  indicator: ReadonlySignal<LastingState | null>;
  /** The one-off messages' popups and the list behind the player's bell. */
  notifications: Notifications;
  /** The context menu that shows at a point, one at a time, such as a library tile's. */
  contextMenu: ContextMenu;
  /** The Settings tab's settings that nothing else keeps. */
  settings: Settings;
}

export interface AppServicesOptions {
  /** Reloads the page, as Reset this device's settings does once it has cleared them: the browser's own unless set. */
  reloadPage?: () => void;
}

export function createAppServices(config: RuntimeConfig, options: AppServicesOptions = {}): AppServices {
  const device = createDeviceStore(browserStorage("localStorage"));
  const api = createAppApi(config.apiBaseUrl, {
    onUnauthorized(route) {
      store.pairingRequired.value = true;
      // The one `last.log` line for a 401, whichever request it answered.
      store.relayStatus(unauthorizedLogText(route));
    }
  });
  const store = createAppStore({
    identity: {
      clientId: getClientId(),
      sessionId: getSessionId(),
      clientType: getClientType(),
      deviceName: getDeviceName()
    },
    device,
    relay(level, message) {
      void api.relayLog(level, message);
    }
  });
  const fullscreen = createStageFullscreen();
  const notifications = createNotifications({
    relay: (logText) => store.relayStatus(logText),
    device,
    inFullscreen: fullscreen.active
  });
  const dialogs = createDialogs({
    relayStatus: (logText) => store.relayStatus(logText),
    record: (message) => notifications.record(message)
  });
  const controlAccess = createControlAccess({ api, dialogs });
  const connection = createServerConnection({
    sseUrl: config.sseUrl,
    pairToken: config.pairToken,
    store,
    api,
    dialogs,
    notifications
  });
  const panel = createPanelHost({ device });
  const relay = (level: string, message: string) => void api.relayLog(level, message);
  // Automatic's target, the library's baseline, loaded from the library stats.
  const baseline = createLibraryBaseline({ store, api, connection, relay });
  const normalization = createLoudnessNormalization({ device, current: store.current, baseline: baseline.lufs });
  const compression = createCompression({ device });
  const audio = createAudioStage({
    device,
    dialogs,
    relay,
    // Once Enhanced audio is off, a new video element takes over from the one the gain stage took.
    renewVideo: () => player.renewVideo(),
    normalizationGainDb: normalization.gainDb,
    compressor: compression.compressor
  });
  // The ratings this device sets and shows, which the Stats tab's stars, the player's, and the rating keys set, and
  // which a history step's play answer reads again.
  const ratings = createItemRatings({ store, api, connection, dialogs, notifications });
  const player = createPlayer({ apiBaseUrl: config.apiBaseUrl, store, audio, api, connection, dialogs, notifications, ratings });
  const playerRating = createPlayerRating({ store, ratings, audio });
  // The panel opening closes the list behind the bell and the rating's popover.
  panel.isOpen.subscribe((open) => {
    if (open) {
      notifications.closeList();
      playerRating.closePopover();
    }
  });
  const playerControls = createPlayerControls({
    device,
    paused: player.paused,
    openFromControls: computed(() => notifications.listOpen.value || playerRating.popoverOpen.value)
  });
  // The tag catalog the Filter and Tags tabs load, which the Stats tab orders a file's tags by, and whose categories
  // By category lists and the Library tab's Random line names.
  const tagCatalog = createTagCatalog({ api, connection });
  const contextMenu = createContextMenu();
  // After the player, so the player handles an item-state event before the library does.
  const library = createLibrary({
    config,
    store,
    api,
    connection,
    player,
    dialogs,
    notifications,
    controlAccess,
    panel,
    device,
    tagCatalog,
    contextMenu,
    // The tag editor, created after the library, which it reads, takes Edit tags… from the library's menus.
    editTags: (target) => tagEditor.editTags(target)
  });
  const filterDialog = createFilterDialog({ store, api, connection, library, panel, device, dialogs, notifications, tagCatalog });
  const tagEditor = createTagEditor({
    store,
    api,
    connection,
    library,
    filter: filterDialog,
    device,
    dialogs,
    notifications,
    tagCatalog
  });
  const statsTab = createStatsTab({
    store,
    api,
    connection,
    tagCatalog,
    normalization,
    enhanced: audio.enhanced,
    dialogs,
    notifications,
    ratings,
    device
  });
  const randomization = createRandomizationTab({ store, api, connection, tagCatalog, dialogs, notifications, device });
  const settings = createSettings({ device, dialogs, reloadPage: options.reloadPage });
  const ambient = createAmbient({
    enabled: settings.ambient,
    tuning: settings.ambientTuning,
    current: store.current,
    attemptId: store.playAttemptId,
    failed: player.mediaFailed
  });
  createAutoPause({ mode: settings.autoPauseMode, panel, overPage: tagEditor.autoTagOpen, player });
  panel.connectTabs({
    library: {
      enter: () => library.open(),
      leave() {
        library.close();
        return true;
      }
    },
    tags: {
      enter: () => tagEditor.open(),
      leave() {
        tagEditor.close();
        return true;
      }
    },
    stats: {
      enter: () => statsTab.open(),
      leave() {
        statsTab.close();
        return true;
      }
    },
    filter: {
      enter: () => void filterDialog.open(),
      leave() {
        filterDialog.close();
        return true;
      }
    },
    randomization: {
      enter: () => randomization.open(),
      leave() {
        randomization.close();
        return true;
      }
    },
    // Settings load nothing and apply as they change, so there is nothing to keep.
    settings: {
      enter() {},
      leave: () => true
    }
  });
  // A panel remembered open starts its tab once the server has passed or failed the compatibility check, or turned out
  // to have no library, so the Library tab can say why.
  connection.on("serverReady", () => panel.startRememberedTab());
  store.compatibilityBlocked.subscribe((blocked) => {
    if (blocked) {
      panel.startRememberedTab();
    }
  });
  store.noLibrary.subscribe((noLibrary) => {
    if (noLibrary) {
      panel.startRememberedTab();
    }
  });
  return {
    config,
    store,
    api,
    dialogs,
    controlAccess,
    connection,
    player,
    playerControls,
    playerRating,
    audio,
    normalization,
    compression,
    ambient,
    fullscreen,
    panel,
    library,
    filterDialog,
    tagEditor,
    statsTab,
    randomization,
    unsaved: computed(() => ({
      filter: filterDialog.view.value?.unsaved ?? false,
      tags: tagEditor.view.value?.savePending ?? false
    })),
    indicator: createPlayerIndicator(store),
    notifications,
    contextMenu,
    settings
  };
}
