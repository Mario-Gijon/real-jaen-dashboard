// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLocalApiObservedPlayers,
  UpstreamUnavailableError,
} from "@/server/local-api/local-api-source";

/** Simulated local API: these tests never reach the real service. */
function answer(body: unknown, status = 200) {
  return vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

const SCOPE = "Jugadores observados en convocatorias; no es una plantilla completa ni necesariamente actual.";
const payload = (data: unknown[], count: unknown = data.length) => ({
  data,
  meta: { count, scope: SCOPE },
});
const source = (fetch: typeof globalThis.fetch, timeoutMs?: number) =>
  createLocalApiObservedPlayers({ baseUrl: "http://127.0.0.1:8001/", fetch, timeoutMs });

afterEach(() => vi.restoreAllMocks());

describe("local API adapter: observed players", () => {
  it("asks for the source id of our team and returns contract players with derived ids", async () => {
    const fetch = answer(
      payload([
        { player_id: 966303, name: "Moha Keita", usual_position: "M" },
        { player_id: 1, name: " Portero Uno ", usual_position: "G" },
        { player_id: 2, name: "Defensa", usual_position: "D" },
        { player_id: 3, name: "Delantero", usual_position: "F" },
      ]),
    );
    expect(await source(fetch)("team-real-jaen")).toEqual({
      teamId: "team-real-jaen",
      players: [
        { id: "sofascore-player-966303", name: "Moha Keita", position: "midfielder" },
        { id: "sofascore-player-1", name: "Portero Uno", position: "goalkeeper" },
        { id: "sofascore-player-2", name: "Defensa", position: "defender" },
        { id: "sofascore-player-3", name: "Delantero", position: "forward" },
      ],
      scope: SCOPE,
      source: { synthetic: false, label: "Datos reales" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8001/api/v1/teams/2841/players",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("keeps an unknown or missing position as unknown, never guessed", async () => {
    const fetch = answer(
      payload([
        { player_id: 1, name: "A", usual_position: "X" },
        { player_id: 2, name: "B", usual_position: null },
        { player_id: 3, name: "C" },
      ]),
    );
    const result = await source(fetch)("team-real-jaen");
    expect(result!.players.map((p) => p.position)).toEqual([null, null, null]);
  });

  it("has nothing for a team without explicit correspondence, and does not call the API", async () => {
    const fetch = answer(payload([]));
    expect(await source(fetch)("team-alto")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("has nothing when the source does not know the team (404)", async () => {
    expect(await source(answer({ detail: "Not found" }, 404))("team-real-jaen")).toBeNull();
  });

  it.each([
    ["no data array", { meta: { scope: SCOPE } }],
    ["no scope", { data: [], meta: { count: 0 } }],
    ["a row without id", payload([{ name: "A", usual_position: "M" }])],
    ["a non-integer id", payload([{ player_id: "966303", name: "A" }])],
    ["a row without name", payload([{ player_id: 1, name: " " }])],
    ["a repeated id", payload([{ player_id: 1, name: "A" }, { player_id: 1, name: "B" }])],
    ["a non-text position", payload([{ player_id: 1, name: "A", usual_position: 3 }])],
  ])("rejects a response with %s", async (_case, body) => {
    await expect(source(answer(body))("team-real-jaen")).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("rejects HTTP errors and non-JSON bodies", async () => {
    await expect(source(answer({}, 500))("team-real-jaen")).rejects.toThrow("HTTP 500");
    await expect(source(answer("<html>"))("team-real-jaen")).rejects.toThrow("no JSON");
  });

  it("turns a refused connection into an unavailable source", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(source(fetch)("team-real-jaen")).rejects.toThrow("Sin conexión");
  });

  it("gives up after the timeout", async () => {
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
        }),
    );
    await expect(
      source(fetch as unknown as typeof globalThis.fetch, 20)("team-real-jaen"),
    ).rejects.toThrow("Sin respuesta en 20 ms");
  });

  it("keeps the players but warns when meta.count does not match", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await source(answer(payload([{ player_id: 1, name: "A" }], 25)))(
      "team-real-jaen",
    );
    expect(result!.players).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
  });
});
