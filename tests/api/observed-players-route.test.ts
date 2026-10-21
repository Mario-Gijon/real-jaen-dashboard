// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiError, ObservedPlayers, SourceInfo } from "@/contract";
import { GET as source } from "@/app/api/v1/source/route";
import { GET } from "@/app/api/v1/teams/[teamId]/players/route";

const call = (teamId: string) =>
  GET(new Request(`http://localhost/api/v1/teams/${teamId}/players`), {
    params: Promise.resolve({ teamId }),
  });

/** Simulated local API: the real service is not reached by these tests. */
function localApi(response: () => Response | Promise<Response>) {
  vi.stubEnv("OBSERVED_PLAYERS_SOURCE", "local");
  vi.stubEnv("LOCAL_DATA_API_URL", "http://127.0.0.1:8001");
  const fetch = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/v1/teams/{teamId}/players", () => {
  it("is synthetic by default: the synthetic squad, labelled as such", async () => {
    const response = await call("team-real-jaen");
    expect(response.status).toBe(200);
    const body = (await response.json()) as ObservedPlayers;
    expect(body.source).toEqual({ synthetic: true, label: "Datos sintéticos" });
    expect(body.players.length).toBeGreaterThan(0);
    expect((await call("team-x")).status).toBe(404);
  });

  it("with the local source, returns only real players and says so", async () => {
    const fetch = localApi(
      () =>
        new Response(
          JSON.stringify({
            data: [{ player_id: 966303, name: "Moha Keita", usual_position: "M" }],
            meta: { count: 1, scope: "Jugadores observados en convocatorias." },
          }),
        ),
    );
    const body = (await (await call("team-real-jaen")).json()) as ObservedPlayers;
    expect(body).toEqual({
      teamId: "team-real-jaen",
      players: [{ id: "sofascore-player-966303", name: "Moha Keita", position: "midfielder" }],
      scope: "Jugadores observados en convocatorias.",
      source: { synthetic: false, label: "Datos reales" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8001/api/v1/teams/2841/players",
      expect.anything(),
    );
    expect(((await source().json()) as SourceInfo).label).toBe("Datos sintéticos y reales");
  });

  it("answers 503 when the real source fails, never synthetic players", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    localApi(() => {
      throw new TypeError("fetch failed");
    });
    const response = await call("team-real-jaen");
    expect(response.status).toBe(503);
    expect(((await response.json()) as ApiError).error.code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("answers 404 for a team without correspondence in the real source", async () => {
    const fetch = localApi(() => new Response("{}"));
    expect((await call("team-alto")).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a local source without its URL, and unknown sources", async () => {
    vi.stubEnv("OBSERVED_PLAYERS_SOURCE", "local");
    vi.stubEnv("LOCAL_DATA_API_URL", "");
    await expect(call("team-real-jaen")).rejects.toThrow("LOCAL_DATA_API_URL");
    vi.stubEnv("OBSERVED_PLAYERS_SOURCE", "otra");
    await expect(call("team-real-jaen")).rejects.toThrow("no disponible");
  });
});
