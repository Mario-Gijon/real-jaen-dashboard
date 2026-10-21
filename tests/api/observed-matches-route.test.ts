// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiError, ObservedPlayerMatches } from "@/contract";
import { GET } from "@/app/api/v1/players/[playerId]/observed-matches/route";

const call = (playerId: string) =>
  GET(new Request(`http://localhost/api/v1/players/${playerId}/observed-matches`), {
    params: Promise.resolve({ playerId }),
  });

/** Simulated local API: the real service is not reached by these tests. */
function localApi(handler: (url: string) => Response) {
  vi.stubEnv("OBSERVED_PLAYERS_SOURCE", "local");
  vi.stubEnv("LOCAL_DATA_API_URL", "http://127.0.0.1:8001");
  const fetch = vi.fn(async (url: string) => handler(url));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/v1/players/{playerId}/observed-matches", () => {
  it("has no observed matches in the synthetic default", async () => {
    expect((await call("player-0001")).status).toBe(404);
    expect((await call("sofascore-player-966303")).status).toBe(404);
  });

  it("with the local source, answers an empty list when the player has no matches", async () => {
    localApi(() => new Response(JSON.stringify({ data: [], meta: { count: 0 } })));
    const response = await call("sofascore-player-966303");
    expect(response.status).toBe(200);
    const body = (await response.json()) as ObservedPlayerMatches;
    expect(body.matches).toEqual([]);
    expect(body.source.synthetic).toBe(false);
  });

  it("answers 404 for a player the source does not know", async () => {
    localApi(() => new Response(JSON.stringify({ error: "Entidad no encontrada" }), { status: 404 }));
    expect((await call("sofascore-player-1")).status).toBe(404);
  });

  it("answers 503 when the real source fails, never synthetic matches", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    localApi(() => {
      throw new TypeError("fetch failed");
    });
    const response = await call("sofascore-player-966303");
    expect(response.status).toBe(503);
    expect(((await response.json()) as ApiError).error.code).toBe("UPSTREAM_UNAVAILABLE");
  });
});
