import { describe, expect, it, vi } from "vitest";
import {
  createServerRequester,
  HttpStatusError,
  noticeRequestFailure,
  readJson,
  refusalError,
  requestFailure,
  requestRoute,
  requestWithNotice,
  sendRequest,
  SERVER_UNREACHABLE_MESSAGE,
  ServerUnreachableError,
  unauthorizedLogText,
  UnauthorizedError,
  UnexpectedResponseError
} from "../api/serverRequest";
import { FILE_NOT_IN_LIBRARY } from "./serverReasons";

function failingWith(error: unknown): typeof fetch {
  return (async () => {
    throw error;
  }) as typeof fetch;
}

function body(text: string, contentType: string | null): Response {
  return new Response(text, contentType === null ? {} : { headers: { "Content-Type": contentType } });
}

describe("sendRequest", () => {
  it.each([
    ["Chrome", "Failed to fetch"],
    ["Safari", "Load failed"],
    ["Firefox", "NetworkError when attempting to fetch resource."]
  ])("words %s's network failure as the server being unreachable", async (_browser, message) => {
    const request = sendRequest(failingWith(new TypeError(message)), "http://server/api/version");
    await expect(request).rejects.toBeInstanceOf(ServerUnreachableError);
    await expect(request).rejects.toThrow(SERVER_UNREACHABLE_MESSAGE);
    expect(SERVER_UNREACHABLE_MESSAGE).toBe("Couldn't reach the server.");
  });

  it("passes on a cancelled request and any other failure as they are", async () => {
    const aborted = new DOMException("The operation was aborted.", "AbortError");
    await expect(sendRequest(failingWith(aborted), "http://server/api/random")).rejects.toBe(aborted);
    const other = new Error("boom");
    await expect(sendRequest(failingWith(other), "http://server/api/random")).rejects.toBe(other);
  });

  it("returns the server's answer, whatever its status", async () => {
    const answer = new Response(null, { status: 503 });
    const send = (async () => answer) as typeof fetch;
    await expect(sendRequest(send, "http://server/api/version", { method: "GET" })).resolves.toBe(answer);
  });
});

describe("createServerRequester", () => {
  it("asks for pairing on every 401, naming the request's route, and throws an UnauthorizedError, and returns any other answer", async () => {
    let answer = new Response(null, { status: 401 });
    const asked: string[] = [];
    const request = createServerRequester((async () => answer) as typeof fetch, (route) => asked.push(route));

    await expect(request("http://server/api/favorite", { method: "POST" })).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(request("http://server/api/presets")).rejects.toThrow("Unauthorized");
    expect(asked).toEqual(["POST /api/favorite", "GET /api/presets"]);

    answer = new Response(null, { status: 500 });
    await expect(request("http://server/api/favorite")).resolves.toBe(answer);
    expect(asked).toHaveLength(2);
  });

  it("names a preset route's id as {presetId} for a 401 from it", async () => {
    const asked: string[] = [];
    const request = createServerRequester((async () => new Response(null, { status: 401 })) as typeof fetch, (route) => asked.push(route));
    await expect(request("http://server/api/presets/0f8c2c1e-7a5b-4c1d-9e3f-2b6a8d4c5e7f/rename", { method: "POST" })).rejects.toBeInstanceOf(
      UnauthorizedError
    );
    expect(asked).toEqual(["POST /api/presets/{presetId}/rename"]);
  });

  it("says the server couldn't be reached, as sendRequest does", async () => {
    const request = createServerRequester(failingWith(new TypeError("Load failed")), () => {});
    await expect(request("http://server/api/favorite")).rejects.toBeInstanceOf(ServerUnreachableError);
  });
});

describe("requestRoute", () => {
  it("names the method and route, without the server, a path before the API, the query, or an item id", () => {
    expect(requestRoute("http://server/api/presets")).toBe("GET /api/presets");
    expect(requestRoute("http://server/api/presets/create", { method: "post" })).toBe("POST /api/presets/create");
    expect(requestRoute("https://host/reelroulette/api/library/query?offset=200", { method: "POST" })).toBe(
      "POST /api/library/query"
    );
    expect(requestRoute("http://server/api/play/item%2042", { method: "POST" })).toBe("POST /api/play/{itemId}");
    expect(requestRoute(new URL("http://server/api/version"))).toBe("GET /api/version");
    expect(requestRoute(new Request("http://server/api/play/item-1", { method: "POST" }))).toBe("POST /api/play/{itemId}");
    expect(requestRoute("https://host/reelroulette/api/show-in-file-manager/item%2F42", { method: "POST" })).toBe(
      "POST /api/show-in-file-manager/{itemId}"
    );
  });

  it("names a preset route's id as {presetId}, as it names an item id, and not create's or reorder's last part", () => {
    for (const action of ["update", "rename", "delete"]) {
      expect(requestRoute(`http://server/api/presets/0f8c2c1e-7a5b-4c1d-9e3f-2b6a8d4c5e7f/${action}`, { method: "POST" })).toBe(
        `POST /api/presets/{presetId}/${action}`
      );
    }
    expect(requestRoute("https://host/reelroulette/api/presets/unsaved%201/rename", { method: "POST" })).toBe("POST /api/presets/{presetId}/rename");
    expect(requestRoute("http://server/api/presets/reorder", { method: "POST" })).toBe("POST /api/presets/reorder");
  });

  it("names a media route's token as {token}, so a log line never carries it", () => {
    expect(requestRoute("http://server/api/media/3f9a2c71-tok", { method: "GET" })).toBe("GET /api/media/{token}");
    expect(requestRoute("https://host/reelroulette/api/media/3f9a2c71-tok?x=1")).toBe("GET /api/media/{token}");
  });

  it("logs a 401 with its route as the one line for it", () => {
    expect(unauthorizedLogText("POST /api/autotag/scan")).toBe("Unauthorized. Pair first. (POST /api/autotag/scan)");
  });
});

describe("refusalError", () => {
  const answer = (body: string | null, type = "application/json") =>
    new Response(body, { status: 409, headers: type ? { "Content-Type": type } : {} });

  it("carries the status and the server's reason and code, or neither for a body without them", async () => {
    const refused = await refusalError(answer(JSON.stringify({ error: 'Another preset is named "Cats".' })));
    expect(refused).toBeInstanceOf(HttpStatusError);
    expect(refused).toMatchObject({ status: 409, reason: 'Another preset is named "Cats".', code: null, message: "HTTP 409" });
    expect(await refusalError(answer(JSON.stringify({ error: "Media can't be read", code: "play_media_unreadable" })))).toMatchObject({
      reason: "Media can't be read",
      code: "play_media_unreadable"
    });
    for (const body of ["{}", '{"error":"","code":""}', '{"error":3,"code":3}', "[]", "not json"]) {
      expect(await refusalError(answer(body)), body).toMatchObject({ reason: null, code: null });
    }
    expect((await refusalError(answer(null, ""))).reason).toBeNull();
    expect((await refusalError(answer('{"error":"Proxy"}', "text/html"))).reason).toBeNull();
  });
});

describe("requestFailure", () => {
  it("gives the server's reason, or says what failed, and keeps the status for the log", () => {
    expect(requestFailure("Saving presets failed", new HttpStatusError(409, 'Another preset is named "Cats".'))).toEqual({
      text: 'Saving presets failed: Another preset is named "Cats".',
      logText: "Saving presets failed (HTTP 409)."
    });
    expect(requestFailure("Saving presets failed", new HttpStatusError(500))).toEqual({
      text: "Saving presets failed.",
      logText: "Saving presets failed (HTTP 500)."
    });
  });

  it("says the server couldn't be reached, and names a response's content type only in the log", () => {
    expect(requestFailure("Filter load failed", new ServerUnreachableError())).toEqual({
      text: "Filter load failed: Couldn't reach the server.",
      logText: "Filter load failed: Couldn't reach the server."
    });
    expect(requestFailure("Filter load failed", new UnexpectedResponseError("text/html"))).toEqual({
      text: "Filter load failed: The server sent an unexpected response.",
      logText: "Filter load failed: The server sent an unexpected response (text/html)."
    });
    expect(requestFailure("Filter load failed", "Boom")).toEqual({ text: "Filter load failed: Boom", logText: "Filter load failed: Boom" });
  });
});

describe("noticeRequestFailure", () => {
  it("shows the failure, logging its status in place of the reason, and nothing for a 401", () => {
    const notice = vi.fn(async (_message: string, _logText?: string) => {});
    noticeRequestFailure({ notice }, "Rating update failed", new HttpStatusError(404, "The file isn't on disk."));
    noticeRequestFailure({ notice }, "Rating update failed", new UnauthorizedError());
    expect(notice.mock.calls).toEqual([["Rating update failed: The file isn't on disk.", "Rating update failed (HTTP 404)."]]);
  });
});

describe("requestWithNotice", () => {
  it("says whether the server took the change, showing why it didn't", async () => {
    const notice = vi.fn(async (_message: string, _logText?: string) => {});
    const dialogs = { notice };
    const send = (response: Response | Error) => async () => {
      if (response instanceof Error) {
        throw response;
      }
      return response;
    };
    const refused = new Response(JSON.stringify({ error: FILE_NOT_IN_LIBRARY }), { status: 404, headers: { "Content-Type": "application/json" } });

    expect(await requestWithNotice(dialogs, "Favorite update failed", send(new Response(null, { status: 204 })))).toBe(true);
    expect(await requestWithNotice(dialogs, "Favorite update failed", send(refused))).toBe(false);
    expect(await requestWithNotice(dialogs, "Favorite update failed", send(new Response(null, { status: 500 })))).toBe(false);
    expect(await requestWithNotice(dialogs, "Favorite update failed", send(new ServerUnreachableError()))).toBe(false);
    expect(await requestWithNotice(dialogs, "Favorite update failed", send(new UnauthorizedError()))).toBe(false);
    expect(notice.mock.calls).toEqual([
      [`Favorite update failed: ${FILE_NOT_IN_LIBRARY}`, "Favorite update failed (HTTP 404)."],
      ["Favorite update failed.", "Favorite update failed (HTTP 500)."],
      ["Favorite update failed: Couldn't reach the server.", "Favorite update failed: Couldn't reach the server."]
    ]);
  });
});

describe("readJson", () => {
  it.each(["application/json", "application/json; charset=utf-8", "Application/JSON", "application/problem+json"])(
    "reads a %s body",
    async (contentType) => {
      await expect(readJson(body('{"ok":true}', contentType))).resolves.toEqual({ ok: true });
    }
  );

  it("names the type of a body that isn't JSON, such as a proxy's HTML page, in place of a SyntaxError", async () => {
    const html = readJson(body("<html>proxy</html>", "text/html; charset=utf-8"));
    await expect(html).rejects.toBeInstanceOf(UnexpectedResponseError);
    await expect(html).rejects.toThrow("The server sent an unexpected response (text/html).");
    await expect(readJson(body("{}", null))).rejects.toThrow("The server sent an unexpected response (text/plain).");
    await expect(readJson(new Response(null))).rejects.toThrow("The server sent an unexpected response (no content type).");
  });

  it("names the type of a JSON-labelled body that doesn't parse", async () => {
    await expect(readJson(body("<html>proxy</html>", "application/json"))).rejects.toThrow(
      "The server sent an unexpected response (application/json)."
    );
  });
});
