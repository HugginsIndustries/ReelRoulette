import {
  createDefaultFilterState,
  filterStateFromApiObject,
  filterStatesEqualForPresetMatch,
  withoutAndLocalModes,
  type ApiFilterState
} from "../filter/filterStateModel";

/** A preset as the fake keeps it: its id, its name, and its filter as the page posted it. */
export interface FakePreset {
  id: string;
  name: string;
  filterState?: unknown;
}

/** A write the fake took or refused, as the page sent it. */
export interface PresetWrite {
  method: string;
  path: string;
  body: any;
  /** The status it answered. */
  status: number;
}

/**
 * The server's presets, kept by id as the server keeps them, answering `GET /api/presets` and the per-preset routes
 * with the server's refusals and their texts, so tabs on two devices can share one. A new preset's id is
 * `preset-{n}`, counting on from the presets it starts with.
 */
export interface FakePresets {
  /** The presets as the server holds them, in order. A test may replace it, as another device's change does. */
  list: FakePreset[];
  /** The writes it answered, in order, taken or refused. */
  readonly writes: PresetWrite[];
  /**
   * The writes it answered, each as `create Mine`, `rename preset-1 Cats`, `update preset-1`, `delete preset-1`, or
   * `reorder preset-2,preset-1`, with its status after it when refused, as `create Mine (409)`.
   */
  summaries(): string[];
  /**
   * While set, every write fails this way: with this status and, if given, this reason, or as a request that couldn't
   * reach the server.
   */
  writeFailure: { status: number; error?: string } | "unreachable" | null;
  /** How many writes it answers, counting from the first, before `writeFailure` applies. */
  writesBeforeFailure: number;
  /** Answers a preset route, or returns null for any other route. A write that can't reach the server throws. */
  answer(method: string, path: string, body: any): Response | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function refused(status: number, error: string): Response {
  return json({ error }, status);
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function readFilter(filterState: unknown) {
  return withoutAndLocalModes(filterStateFromApiObject(filterState as ApiFilterState | null | undefined));
}

export function createFakePresets(initial: readonly FakePreset[] = []): FakePresets {
  let created = initial.length;

  /** The refusal for a name another preset than `own` has, ignoring case, or for an empty one. */
  function nameRefusal(name: unknown, own: FakePreset | null): Response | null {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) {
      return refused(400, "A preset needs a name.");
    }
    const other = fake.list.find((preset) => preset !== own && sameName(preset.name, trimmed));
    return other ? refused(409, `Another preset is named "${other.name}".`) : null;
  }

  /** The refusal for a filter that isn't an object, is the default one, or another preset than `own` has. */
  function filterRefusal(filterState: unknown, own: FakePreset | null): Response | null {
    if (filterState !== null && filterState !== undefined && (typeof filterState !== "object" || Array.isArray(filterState))) {
      return refused(400, "filterState must be an object");
    }
    const filter = readFilter(filterState);
    if (filterStatesEqualForPresetMatch(filter, createDefaultFilterState())) {
      return refused(400, "A preset can't hold the default filter.");
    }
    const other = fake.list.find((preset) => preset !== own && filterStatesEqualForPresetMatch(readFilter(preset.filterState), filter));
    return other ? refused(409, `Preset "${other.name}" already has this filter.`) : null;
  }

  function write(path: string, body: any): Response {
    if (path === "/api/presets/create") {
      const refusal = nameRefusal(body?.name, null) ?? filterRefusal(body?.filterState, null);
      if (refusal) {
        return refusal;
      }
      const preset: FakePreset = { id: `preset-${++created}`, name: body.name.trim(), filterState: body.filterState };
      fake.list = [...fake.list, preset];
      return json(preset);
    }
    if (path === "/api/presets/reorder") {
      const ids: unknown[] = Array.isArray(body?.presetIds) ? body.presetIds : [];
      const ordered = ids.map((id) => fake.list.find((preset) => preset.id === id));
      if (ordered.length !== fake.list.length || new Set(ids).size !== ids.length || ordered.some((preset) => !preset)) {
        return refused(409, "The order must name every preset once.");
      }
      fake.list = ordered as FakePreset[];
      return new Response(null, { status: 200 });
    }
    const match = /^\/api\/presets\/([^/]+)\/(update|rename|delete)$/.exec(path);
    if (!match) {
      return new Response(null, { status: 404 });
    }
    const preset = fake.list.find((candidate) => candidate.id === decodeURIComponent(match[1]!));
    if (!preset) {
      return refused(404, "Preset not found.");
    }
    if (match[2] === "delete") {
      fake.list = fake.list.filter((candidate) => candidate !== preset);
      return new Response(null, { status: 200 });
    }
    const refusal = match[2] === "rename" ? nameRefusal(body?.name, preset) : filterRefusal(body?.filterState, preset);
    if (refusal) {
      return refusal;
    }
    const written: FakePreset =
      match[2] === "rename" ? { ...preset, name: body.name.trim() } : { ...preset, filterState: body.filterState };
    fake.list = fake.list.map((candidate) => (candidate === preset ? written : candidate));
    return json(written);
  }

  function summary(write: PresetWrite): string {
    const route = /^\/api\/presets\/(?:([^/]+)\/)?([a-z]+)$/.exec(write.path);
    const [id, action] = [decodeURIComponent(route?.[1] ?? ""), route?.[2] ?? write.path];
    const text =
      action === "create"
        ? `create ${write.body?.name}`
        : action === "reorder"
          ? `reorder ${(write.body?.presetIds ?? []).join(",")}`
          : action === "rename"
            ? `rename ${id} ${write.body?.name}`
            : `${action} ${id}`;
    return write.status >= 400 ? `${text} (${write.status})` : text;
  }

  const fake: FakePresets = {
    list: initial.slice(),
    writes: [],
    writeFailure: null,
    writesBeforeFailure: 0,
    summaries() {
      return fake.writes.map(summary);
    },
    answer(method, path, body) {
      if (path === "/api/presets" && method === "GET") {
        return json(fake.list);
      }
      if (method !== "POST" || !path.startsWith("/api/presets/")) {
        return null;
      }
      const failure = fake.writes.length >= fake.writesBeforeFailure ? fake.writeFailure : null;
      if (failure === "unreachable") {
        throw new TypeError("NetworkError when attempting to fetch resource.");
      }
      const response = failure ? (failure.error ? refused(failure.status, failure.error) : new Response(null, { status: failure.status })) : write(path, body);
      fake.writes.push({ method, path, body, status: response.status });
      return response;
    }
  };
  return fake;
}
