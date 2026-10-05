// @vitest-environment node
import { describe, expect, it } from "vitest";
import type {
  Competition,
  MatchDetail,
  MatchSummary,
  PlayerSeason,
  TeamSeason,
  TeamStanding,
} from "@/contract";
import { GET as competitions } from "./competitions/route";
import { GET as match } from "./matches/[matchId]/route";
import { GET as player } from "./players/[playerId]/route";
import { GET as seasonMatches } from "./seasons/[seasonId]/matches/route";
import { GET as teamSeason } from "./seasons/[seasonId]/teams/[teamId]/route";
import { GET as seasonTeams } from "./seasons/[seasonId]/teams/route";

const SEASON = "season-demo-2026-27";
const request = (path: string) => new Request(`http://localhost/api/v1${path}`);
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

async function body<T>(response: Response, status = 200): Promise<T> {
  expect(response.status).toBe(status);
  return (await response.json()) as T;
}

describe("/api/v1 (read-only, synthetic source)", () => {
  it("GET /competitions", async () => {
    const [competition] = await body<Competition[]>(await competitions());
    expect(competition.seasons[0].id).toBe(SEASON);
  });

  it("GET /seasons/{seasonId}/matches with round and team filters", async () => {
    const all = await body<MatchSummary[]>(
      await seasonMatches(request(`/seasons/${SEASON}/matches`), params({ seasonId: SEASON })),
    );
    expect(all).toHaveLength(380);
    const filtered = await body<MatchSummary[]>(
      await seasonMatches(
        request(`/seasons/${SEASON}/matches?round=2&team=team-real-jaen`),
        params({ seasonId: SEASON }),
      ),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].round).toBe(2);
  });

  it("rejects invalid filters and unknown seasons", async () => {
    const call = (query: string, seasonId = SEASON) =>
      seasonMatches(request(`/seasons/${seasonId}/matches${query}`), params({ seasonId }));
    expect((await body<{ error: { code: string } }>(await call("?round=0"), 400)).error.code).toBe(
      "BAD_REQUEST",
    );
    await body(await call("?round=dos"), 400);
    await body(await call("?team=team-x"), 400);
    expect(
      (await body<{ error: { code: string } }>(await call("", "season-x"), 404)).error.code,
    ).toBe("NOT_FOUND");
  });

  it("GET /matches/{matchId}", async () => {
    const detail = await body<MatchDetail>(
      await match(request("/matches/match-r01-01"), params({ matchId: "match-r01-01" })),
    );
    expect(detail.lineups?.home.starters).toHaveLength(11);
    await body(await match(request("/matches/x"), params({ matchId: "x" })), 404);
  });

  it("GET /seasons/{seasonId}/teams and /teams/{teamId}", async () => {
    const rows = await body<TeamStanding[]>(
      await seasonTeams(request(`/seasons/${SEASON}/teams`), params({ seasonId: SEASON })),
    );
    expect(rows).toHaveLength(20);
    const team = await body<TeamSeason>(
      await teamSeason(
        request(`/seasons/${SEASON}/teams/team-real-jaen`),
        params({ seasonId: SEASON, teamId: "team-real-jaen" }),
      ),
    );
    expect(team.team.name).toBe("Real Jaén CF");
    expect(team.squad).toHaveLength(24);
    await body(
      await teamSeason(
        request(`/seasons/${SEASON}/teams/x`),
        params({ seasonId: SEASON, teamId: "x" }),
      ),
      404,
    );
  });

  it("GET /players/{playerId}?season= requires the season", async () => {
    const profile = await body<PlayerSeason>(
      await player(
        request(`/players/player-0001?season=${SEASON}`),
        params({ playerId: "player-0001" }),
      ),
    );
    expect(profile.team.id).toBe("team-real-jaen");
    await body(
      await player(request("/players/player-0001"), params({ playerId: "player-0001" })),
      400,
    );
    await body(
      await player(request(`/players/x?season=${SEASON}`), params({ playerId: "x" })),
      404,
    );
  });

  it("serialises missing values with their reason and real zeros as numbers", async () => {
    const detail = await body<MatchDetail>(
      await match(request("/matches/match-r01-01"), params({ matchId: "match-r01-01" })),
    );
    const rows = Object.values(detail.playerStats);
    expect(rows.some((row) => row.goals.value === 0)).toBe(true);
    expect(rows.find((row) => row.saves.value === null)?.saves).toEqual({
      value: null,
      reason: "not_available",
    });
  });
});
