import {
  filterStateFromApiObject,
  filterStatesEqualForPresetMatch,
  headerPresetPick,
  serializeFilterStateForApi,
  withoutAndLocalModes,
  type ApiFilterState,
  type FilterState
} from "../filter/filterStateModel";
import { PLAYBACK_REQUEST_TIMEOUT_MS, readJson, refusalError, UnauthorizedError, withTimeout } from "../api/serverRequest";
import { randomPickOptionsRequest, type RandomOptions } from "../random/randomOptions";
import type { AppStore, RandomCycle } from "../state/appStore";
import type { components } from "../types/openapi.generated";

type PlaybackItemResponse = components["schemas"]["PlaybackItemResponse"];
type RandomPickResponse = components["schemas"]["RandomPickResponse"];
export type RandomPickRequest = components["schemas"]["RandomRequest"];

export interface RandomPickInputs {
  clientId: string;
  appliedFilter: FilterState;
  presets: readonly { id: string; filterState?: ApiFilterState | null }[];
  /** The preset dropdown's value: a preset id, empty for None, or the starred row. */
  selectedPresetValue: string;
  /** The Randomization tab's options. */
  options: RandomOptions;
}

/**
 * The body of `POST /api/random`, which `POST /api/random/cycle` takes too, with the Randomization tab's options. It
 * names the preset dropdown's preset only while that preset's filter still equals the applied filter.
 */
export function randomPickRequest(inputs: RandomPickInputs): RandomPickRequest {
  const selectedPreset =
    headerPresetPick(inputs.selectedPresetValue) === "named"
      ? inputs.presets.find((preset) => preset.id === inputs.selectedPresetValue)
      : undefined;
  const presetStillMatches = selectedPreset
    ? filterStatesEqualForPresetMatch(
        withoutAndLocalModes(filterStateFromApiObject(selectedPreset.filterState)),
        inputs.appliedFilter
      )
    : false;
  const presetId = presetStillMatches ? String(selectedPreset?.id || "").trim() : "";
  const body: RandomPickRequest = {
    clientId: inputs.clientId,
    includeVideos: true,
    includePhotos: true,
    filterState: serializeFilterStateForApi(inputs.appliedFilter),
    options: randomPickOptionsRequest(inputs.options)
  };
  if (presetId) {
    body.presetId = presetId;
  }
  return body;
}

/** The pick body for the applied filter, the preset dropdown's preset, and the Randomization tab's options as they are now. */
export function currentRandomPickRequest(
  store: Pick<AppStore, "identity" | "appliedFilter" | "presets" | "selectedPresetValue" | "randomOptions">
): RandomPickRequest {
  return randomPickRequest({
    clientId: store.identity.clientId,
    appliedFilter: store.appliedFilter.peek(),
    presets: store.presets.peek(),
    selectedPresetValue: store.selectedPresetValue(),
    options: store.randomOptions.peek()
  });
}

export type RandomPickOutcome =
  /** A pick is already waiting for the server, so nothing was sent. */
  | { kind: "busy" }
  /** The picked item, and this device's Shuffle cycle numbers after the pick. */
  | { kind: "picked"; item: PlaybackItemResponse; cycle: RandomCycle | null }
  /** The server found nothing eligible for the filter, and its cycle numbers say so. */
  | { kind: "none"; cycle: RandomCycle | null }
  | { kind: "unauthorized" }
  /** The server refused the pick, with an `HttpStatusError`, or the request failed. */
  | { kind: "failed"; error: unknown }
  /** The server did not answer in time, and the request was cancelled. */
  | { kind: "timedOut"; timeoutMs: number };

/**
 * Sends one `POST /api/random` body; the signal cancels it. A send that couldn't reach the server throws a
 * `ServerUnreachableError`, as `sendRequest` does, so its message reads the same in every browser.
 */
export type RandomPickSend = (body: string, signal: AbortSignal) => Promise<Response>;

export interface RandomPicker {
  pick(body: unknown): Promise<RandomPickOutcome>;
}

/**
 * Random picks for one page, one request at a time, so repeated presses cannot play and record several
 * items. A pick the server does not answer within the timeout is cancelled and resolves as timed out, and
 * its answer is never used, even when it arrives after a newer pick was sent.
 */
export function createRandomPicker(send: RandomPickSend, timeoutMs: number = PLAYBACK_REQUEST_TIMEOUT_MS): RandomPicker {
  let inFlight = false;
  return {
    async pick(body) {
      if (inFlight) {
        return { kind: "busy" };
      }

      inFlight = true;
      try {
        const outcome = await withTimeout((signal) => request(send, JSON.stringify(body), signal), timeoutMs);
        switch (outcome.kind) {
          case "answered":
            return outcome.value;
          case "timedOut":
            return { kind: "timedOut", timeoutMs };
          case "failed":
            // `request` answers every failure itself, so this only keeps the outcome whole.
            return { kind: "failed", error: outcome.error };
        }
      } finally {
        inFlight = false;
      }
    }
  };
}

async function request(send: RandomPickSend, body: string, signal: AbortSignal): Promise<RandomPickOutcome> {
  try {
    const response = await send(body, signal);
    if (response.status === 401) {
      return { kind: "unauthorized" };
    }
    if (!response.ok) {
      return { kind: "failed", error: await refusalError(response) };
    }

    const data = await readJson<Partial<RandomPickResponse> | null>(response);
    const item = data?.item;
    const cycle = data?.cycle ?? null;
    if (!item?.mediaUrl) {
      return { kind: "none", cycle };
    }
    return { kind: "picked", item, cycle };
  } catch (error) {
    // A send that answers 401 itself, as `api.request` does, asks for pairing and throws.
    if (error instanceof UnauthorizedError) {
      return { kind: "unauthorized" };
    }
    return { kind: "failed", error };
  }
}
