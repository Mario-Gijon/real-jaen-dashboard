import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  getCompetitions,
  getMatch,
  getObservedPlayers,
  getPlayer,
  getPlayerObservedMatches,
  getPlayerProfile,
  getSeasonMatches,
  getSeasonTeams,
  getSource,
  getTeamSeason,
} from "@/client/api";

function answer(body: unknown, status = 200) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const urls = (fetch: ReturnType<typeof answer>) =>
  fetch.mock.calls.map((call) => (call as unknown[])[0]);

afterEach(() => vi.unstubAllGlobals());

describe("typed client", () => {
  it("builds every /api/v1 URL, so screens never do", async () => {
    const fetch = answer([]);
    await getSource();
    await getCompetitions();
    await getSeasonMatches("s 1");
    await getSeasonMatches("s1", { round: 3, teamId: "team-a" });
    await getMatch("m1");
    await getSeasonTeams("s1");
    await getTeamSeason("s1", "team-a");
    await getPlayer("p1", "s1");
    await getObservedPlayers("team a");
    await getPlayerProfile("sofascore-player-1");
    await getPlayerObservedMatches("sofascore-player-1");
    expect(urls(fetch)).toEqual([
      "/api/v1/source",
      "/api/v1/competitions",
      "/api/v1/seasons/s%201/matches",
      "/api/v1/seasons/s1/matches?round=3&team=team-a",
      "/api/v1/matches/m1",
      "/api/v1/seasons/s1/teams",
      "/api/v1/seasons/s1/teams/team-a",
      "/api/v1/players/p1?season=s1",
      "/api/v1/teams/team%20a/players",
      "/api/v1/players/sofascore-player-1/profile",
      "/api/v1/players/sofascore-player-1/observed-matches",
    ]);
  });

  it("passes the abort signal through", async () => {
    const fetch = answer([]);
    const controller = new AbortController();
    await getCompetitions({ signal: controller.signal });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/competitions",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("raises the contract error", async () => {
    answer({ error: { code: "NOT_FOUND", message: "Partido no encontrado." } }, 404);
    await expect(getMatch("x")).rejects.toEqual(
      expect.objectContaining({
        status: 404,
        code: "NOT_FOUND",
        message: "Partido no encontrado.",
      }),
    );
    await expect(getMatch("x")).rejects.toBeInstanceOf(ApiRequestError);
  });
});
