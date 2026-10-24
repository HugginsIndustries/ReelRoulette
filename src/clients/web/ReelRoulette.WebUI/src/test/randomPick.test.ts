import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpStatusError, PLAYBACK_REQUEST_TIMEOUT_MS, UnexpectedResponseError } from "../api/serverRequest";
import { HEADER_PRESET_STARRED_VALUE, createDefaultFilterState } from "../filter/filterStateModel";
import { DEFAULT_RANDOM_OPTIONS } from "../random/randomOptions";
import {
  createRandomPicker,
  randomPickRequest,
  type RandomPickInputs,
  type RandomPickOutcome,
  type RandomPickSend
} from "../playback/randomPick";
import { answerCycle, randomAnswer } from "./randomAnswer";
import { LIBRARY_EMPTY } from "./serverReasons";

interface SentRequest {
  body: string;
  signal: AbortSignal;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
}

/** A send that waits until the test answers each request. */
function heldSend(): { sent: SentRequest[]; send: RandomPickSend } {
  const sent: SentRequest[] = [];
  const send: RandomPickSend = (body, signal) =>
    new Promise<Response>((resolve, reject) => {
      sent.push({ body, signal, resolve, reject });
    });
  return { sent, send };
}

function randomItem(id: string) {
  return {
    id: `/media/${id}.mp4`,
    itemId: id,
    displayName: `${id}.mp4`,
    mediaType: "video" as const,
    mediaUrl: `/api/media/${id}`,
    isFavorite: false,
    isBlacklisted: false
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("randomPick", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits ten seconds for the server", () => {
    expect(PLAYBACK_REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  it("sends one pick at a time and sends nothing for presses while one is waiting", async () => {
    const { sent, send } = heldSend();
    const picker = createRandomPicker(send);

    const first = picker.pick({ press: 1 });
    await expect(picker.pick({ press: 2 })).resolves.toEqual({ kind: "busy" });
    await expect(picker.pick({ press: 3 })).resolves.toEqual({ kind: "busy" });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].body)).toEqual({ press: 1 });

    sent[0].resolve(randomAnswer(randomItem("a")));
    await expect(first).resolves.toEqual({ kind: "picked", item: randomItem("a"), cycle: answerCycle(true) });

    const next = picker.pick({ press: 4 });
    expect(sent).toHaveLength(2);
    sent[1].resolve(randomAnswer(randomItem("b")));
    await expect(next).resolves.toEqual({ kind: "picked", item: randomItem("b"), cycle: answerCycle(true) });
  });

  it("cancels a pick the server does not answer within the timeout and lets the next press start a fresh one", async () => {
    const { sent, send } = heldSend();
    const picker = createRandomPicker(send);
    let outcome: RandomPickOutcome | undefined;
    void picker.pick({ press: 1 }).then((result) => {
      outcome = result;
    });

    await vi.advanceTimersByTimeAsync(PLAYBACK_REQUEST_TIMEOUT_MS - 1);
    expect(outcome).toBeUndefined();
    expect(sent[0].signal.aborted).toBe(false);
    await expect(picker.pick({ press: 2 })).resolves.toEqual({ kind: "busy" });

    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toEqual({ kind: "timedOut", timeoutMs: PLAYBACK_REQUEST_TIMEOUT_MS });
    expect(sent[0].signal.aborted).toBe(true);
    // A cancelled fetch rejects; that must not reach anyone.
    sent[0].reject(new DOMException("The operation was aborted.", "AbortError"));

    const fresh = picker.pick({ press: 3 });
    expect(sent).toHaveLength(2);
    expect(sent[1].signal.aborted).toBe(false);
    sent[1].resolve(randomAnswer(randomItem("b")));
    await expect(fresh).resolves.toEqual({ kind: "picked", item: randomItem("b"), cycle: answerCycle(true) });
  });

  it("ignores an answer that arrives after a newer pick was sent", async () => {
    const { sent, send } = heldSend();
    const picker = createRandomPicker(send);

    const stale = picker.pick({ press: 1 });
    await vi.advanceTimersByTimeAsync(PLAYBACK_REQUEST_TIMEOUT_MS);
    await expect(stale).resolves.toEqual({ kind: "timedOut", timeoutMs: PLAYBACK_REQUEST_TIMEOUT_MS });

    const newer = picker.pick({ press: 2 });
    sent[0].resolve(randomAnswer(randomItem("late")));
    await vi.advanceTimersByTimeAsync(0);
    // The late answer neither completes the newer pick nor frees it for another press.
    await expect(picker.pick({ press: 3 })).resolves.toEqual({ kind: "busy" });

    sent[1].resolve(randomAnswer(randomItem("b")));
    await expect(newer).resolves.toEqual({ kind: "picked", item: randomItem("b"), cycle: answerCycle(true) });
    expect(sent).toHaveLength(2);
  });

  it("maps each kind of answer and frees the next press after it", async () => {
    const answers: Array<() => Promise<Response>> = [
      async () => new Response("", { status: 401 }),
      async () => jsonResponse({ error: LIBRARY_EMPTY }, 503),
      async () => randomAnswer(null),
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => new Response("<html>Bad gateway</html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }),
      async () => randomAnswer(randomItem("a"))
    ];
    const picker = createRandomPicker(() => answers.shift()!());

    await expect(picker.pick({})).resolves.toEqual({ kind: "unauthorized" });
    const refused = await picker.pick({});
    expect(refused).toEqual({ kind: "failed", error: expect.any(HttpStatusError) });
    expect(refused).toMatchObject({ error: { status: 503, reason: LIBRARY_EMPTY } });
    await expect(picker.pick({})).resolves.toEqual({ kind: "none", cycle: answerCycle(null) });
    await expect(picker.pick({})).resolves.toEqual({ kind: "failed", error: new TypeError("Failed to fetch") });
    const unexpected = await picker.pick({});
    expect(unexpected).toEqual({ kind: "failed", error: expect.any(UnexpectedResponseError) });
    await expect(picker.pick({})).resolves.toEqual({ kind: "picked", item: randomItem("a"), cycle: answerCycle(true) });
  });
});

describe("randomPickRequest", () => {
  const favorites = { id: " preset-favorites ", name: "Favorites", filterState: { ...createDefaultFilterState(), favoritesMode: "only" as const } };
  const inputs: RandomPickInputs = {
    clientId: "client-1",
    appliedFilter: { ...createDefaultFilterState(), favoritesMode: "only" },
    presets: [favorites],
    selectedPresetValue: " preset-favorites ",
    options: DEFAULT_RANDOM_OPTIONS
  };

  it("names the preset dropdown's preset while its filter equals the applied filter", () => {
    const body = randomPickRequest(inputs);
    expect(body).toMatchObject({
      clientId: "client-1",
      includeVideos: true,
      includePhotos: true,
      presetId: "preset-favorites"
    });
    expect(body.filterState?.favoritesMode).toBe("only");
    expect(Object.keys(body)).toEqual(["clientId", "includeVideos", "includePhotos", "filterState", "options", "presetId"]);
  });

  it("sends the Randomization tab's options, the defaults until they change", () => {
    expect(randomPickRequest(inputs).options).toEqual({
      shuffle: true,
      rememberPlaysForDays: 30,
      spreadByFolder: true,
      spreadByTags: "off",
      favorLessPlayed: false,
      favorNewlyAdded: false,
      favorNewlyCreated: false,
      favorHigherRated: false
    });
    const changed = randomPickRequest({
      ...inputs,
      options: { ...DEFAULT_RANDOM_OPTIONS, shuffle: false, rememberPlaysForDays: null, spreadByTags: true, tagSpread: "byCategory", spreadCategoryIds: ["people"], favorHigherRated: true }
    });
    expect(changed.options).toEqual({
      shuffle: false,
      rememberPlaysForDays: null,
      spreadByFolder: true,
      spreadByTags: "byCategory",
      spreadCategoryIds: ["people"],
      favorLessPlayed: false,
      favorNewlyAdded: false,
      favorNewlyCreated: false,
      favorHigherRated: true
    });
  });

  it("leaves the preset out for None, the starred row, and a preset whose filter no longer matches", () => {
    for (const selectedPresetValue of ["", HEADER_PRESET_STARRED_VALUE]) {
      expect(randomPickRequest({ ...inputs, selectedPresetValue }).presetId).toBeUndefined();
    }
    const changed = randomPickRequest({ ...inputs, appliedFilter: { ...createDefaultFilterState(), favoritesMode: "only", onlyNeverPlayed: true } });
    expect(changed.presetId).toBeUndefined();
    expect(changed.filterState?.onlyNeverPlayed).toBe(true);
    const playable = randomPickRequest({ ...inputs, appliedFilter: { ...createDefaultFilterState(), favoritesMode: "only", onlyBrowserPlayable: true } });
    expect(playable.presetId).toBeUndefined();
    expect(playable.filterState?.onlyBrowserPlayable).toBe(true);
  });
});
