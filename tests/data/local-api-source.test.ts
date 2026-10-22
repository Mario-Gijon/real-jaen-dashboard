// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalApiObservedPlayers,
  clearTeamNameCache,
  createLocalApiObservedMatches,
  createLocalApiPlayerProfile,
  createLocalApiMatchDetail,
  createLocalApiTeamMatches,
  sourceMatchId,
  sourcePlayerId,
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

beforeEach(() => clearTeamNameCache());
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

/** Shape of `GET /api/v1/players/966303` as the real local API answered it on 2026-10-21. */
const moha = {
  source: "Sofascore",
  player_id: 966303,
  name: "Moha Keita",
  usual_position: "M",
  country: "Senegal",
  birth_date: "1999-09-18",
  height_cm: 165,
  preferred_foot: null,
  fetched_at: "2026-10-21T12:07:39+00:00",
};
const profileSource = (fetch: typeof globalThis.fetch) =>
  createLocalApiPlayerProfile({ baseUrl: "http://127.0.0.1:8001", fetch });

describe("local API adapter: player profile", () => {
  it("resolves our derived id to the provider id only here", async () => {
    expect(sourcePlayerId("sofascore-player-966303")).toBe(966303);
    for (const id of ["player-0001", "sofascore-player-", "sofascore-player-01", "sofascore-player-1x", "sofascore-player-99999999999999999999"]) {
      expect(sourcePlayerId(id), id).toBeNull();
    }
  });

  it("returns personal data only, ignoring the provider name and the download time", async () => {
    const fetch = answer({ data: moha });
    expect(await profileSource(fetch)("sofascore-player-966303")).toEqual({
      player: {
        id: "sofascore-player-966303",
        name: "Moha Keita",
        position: "midfielder",
        birthDate: "1999-09-18",
        heightCm: 165,
        preferredFoot: null,
        country: "Senegal",
      },
      scope: "Datos personales según la fuente. No indican equipo actual.",
      source: { synthetic: false, label: "Datos reales" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8001/api/v1/players/966303",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("keeps absent, null, empty or unknown values as unknown", async () => {
    const fetch = answer({
      data: { player_id: 1, name: "Sin Datos", usual_position: "X", country: "", height_cm: null, birth_date: null, preferred_foot: "Ambidiestro" },
    });
    const result = await profileSource(fetch)("sofascore-player-1");
    expect(result!.player).toEqual({
      id: "sofascore-player-1", name: "Sin Datos", position: null,
      birthDate: null, heightCm: null, preferredFoot: null, country: null,
    });
  });

  it("maps the foot whatever its case", async () => {
    const result = await profileSource(answer({ data: { ...moha, preferred_foot: "Left" } }))("sofascore-player-966303");
    expect(result!.player.preferredFoot).toBe("left");
  });

  it("does not call the API for ids that are not derived from it", async () => {
    const fetch = answer({ data: moha });
    expect(await profileSource(fetch)("player-0001")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("has nothing for a player the source does not know (404)", async () => {
    expect(await profileSource(answer({ error: "Entidad no encontrada" }, 404))("sofascore-player-1")).toBeNull();
  });

  it.each([
    ["no data object", { player_id: 966303 }],
    ["another player", { data: { ...moha, player_id: 1 } }],
    ["no name", { data: { ...moha, name: "" } }],
    ["a malformed birth date", { data: { ...moha, birth_date: "18/09/1999" } }],
    ["a non-integer height", { data: { ...moha, height_cm: "165" } }],
    ["a non-text country", { data: { ...moha, country: 7 } }],
  ])("rejects a response with %s", async (_case, body) => {
    await expect(profileSource(answer(body))("sofascore-player-966303")).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("turns HTTP errors and refused connections into an unavailable source", async () => {
    await expect(profileSource(answer({}, 500))("sofascore-player-966303")).rejects.toThrow("HTTP 500");
    const refused = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(profileSource(refused)("sofascore-player-966303")).rejects.toThrow("Sin conexión");
  });
});

/**
 * Rows shaped like `GET /api/v1/players/{id}/matches` of the real local API
 * on 2026-10-21 (trimmed): a confirmed appearance and an unused substitute,
 * whose `statistics` only carries `totalShots: 0`.
 */
const callUp = (overrides: Record<string, unknown> = {}, match: Record<string, unknown> = {}) => ({
  source: "Sofascore", match_id: 16599363, team_id: 2841, player_id: 966303, side: "away",
  source_team_id: 2841, substitute: false, match_position: "F", shirt_number: 19, minutes_played: 83,
  played: true, fetched_at: "2026-10-21T12:07:31+00:00",
  statistics: { totalPass: 24, accuratePass: 19, goalAssist: 0, goals: 1, minutesPlayed: 83, rating: 7.4,
    expectedGoals: 0.454, totalShots: 4, statisticsType: { sportSlug: "football", statisticsType: "player" } },
  match: { source: "Sofascore", match_id: 16599363, kickoff_utc: "2026-08-30T17:15:00+00:00", status: "finished",
    tournament_id: 94191, competition: "Primera Federacion, Group 2", season_id: 97382, season: "26/27", round: 1,
    home_team_id: 135672, away_team_id: 2841, home_score: 0, away_score: 3, fetched_at: "2026-10-21T12:07:26+00:00",
    ...match },
  ...overrides,
});
const unused = callUp(
  { match_id: 16599388, side: "home", substitute: true, minutes_played: null, played: null,
    statistics: { totalShots: 0, statisticsType: { sportSlug: "football", statisticsType: "player" } } },
  { match_id: 16599388, kickoff_utc: "2026-09-06T09:30:00+00:00", round: 2, home_team_id: 2841, away_team_id: 24265,
    home_score: 2, away_score: 2 },
);
const TEAM_NAMES: Record<string, string> = { "2841": "Real Jaén", "135672": "CE Europa" };

/** Simulated local API for the matches and the team names they need. */
function matchesApi(rows: unknown[] | null, teams: Record<string, string> = TEAM_NAMES) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const team = /\/api\/v1\/teams\/(\d+)$/.exec(url);
    if (team) {
      const name = teams[team[1]];
      return name
        ? new Response(JSON.stringify({ data: { source: "Sofascore", team_id: Number(team[1]), name } }))
        : new Response(JSON.stringify({ error: "Entidad no encontrada" }), { status: 404 });
    }
    return rows === null
      ? new Response(JSON.stringify({ error: "Entidad no encontrada" }), { status: 404 })
      : new Response(JSON.stringify({ data: rows, meta: { count: rows.length } }));
  });
}
const matchesSource = (fetch: typeof globalThis.fetch) =>
  createLocalApiObservedMatches({ baseUrl: "http://127.0.0.1:8001", fetch });
const missing = { value: null, reason: "not_available" };

describe("local API adapter: observed matches", () => {
  it("returns call-ups newest first, with the source's season, competition and team names", async () => {
    const fetch = matchesApi([callUp(), unused]);
    const result = await matchesSource(fetch)("sofascore-player-966303");
    expect(result!.matches.map((m) => m.match.id)).toEqual(["sofascore-match-16599388", "sofascore-match-16599363"]);
    expect(result!.matches[1]).toEqual({
      match: {
        id: "sofascore-match-16599363", kickoff: "2026-08-30T17:15:00+00:00", status: "finished",
        competition: "Primera Federacion, Group 2", season: "26/27", round: 1,
        home: { id: "sofascore-team-135672", name: "CE Europa" },
        away: { id: "team-real-jaen", name: "Real Jaén" },
        score: { home: 0, away: 3 },
      },
      side: "away",
      role: "starter",
      position: "forward",
      participation: "confirmed",
      stats: {
        minutes: { value: 83 }, goals: { value: 1 }, assists: { value: 0 }, shots: { value: 4 },
        xg: { value: 0.454 }, passesCompleted: { value: 19 }, passes: { value: 24 }, rating: { value: 7.4 },
        // Keys this row omits stay missing, never 0, although other stats are given.
        shotsOnTarget: missing, dribbles: missing, dribblesWon: missing, recoveries: missing, possessionLost: missing,
        duelsWon: missing, duelsLost: missing, fouls: missing, saves: missing,
      },
    });
    expect(result!.ratingSource).toBe("SofaScore");
    expect(result!.source).toEqual({ synthetic: false, label: "Datos reales" });
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8001/api/v1/players/966303/matches", expect.anything());
  });

  it("maps each individual metric from its own source key, keeping real zeros", async () => {
    const statistics = { minutesPlayed: 90, totalShots: 3, onTargetScoringAttempt: 0, shotOffTarget: 2, blockedScoringAttempt: 1,
      totalContest: 4, wonContest: 1, ballRecovery: 6, possessionLostCtrl: 9, duelWon: 7, duelLost: 0, fouls: 2, saves: 3,
      wasFouled: 5, touches: 40 };
    const result = await matchesSource(matchesApi([callUp({ statistics, match_position: "G" })]))("sofascore-player-966303");
    const [row] = result!.matches;
    expect(row.position).toBe("goalkeeper");
    expect(row.stats).toMatchObject({
      shots: { value: 3 }, shotsOnTarget: { value: 0 }, dribbles: { value: 4 }, dribblesWon: { value: 1 },
      recoveries: { value: 6 }, possessionLost: { value: 9 }, duelsWon: { value: 7 }, duelsLost: { value: 0 },
      fouls: { value: 2 }, saves: { value: 3 }, goals: missing, passes: missing,
    });
  });

  it.each([[null], ["X"], [undefined]])("leaves an unknown match position (%s) unknown", async (position) => {
    const result = await matchesSource(matchesApi([callUp({ match_position: position })]))("sofascore-player-966303");
    expect(result!.matches[0].position).toBeNull();
  });

  it("never treats a statistics object with totalShots 0 as participation or real stats", async () => {
    const result = await matchesSource(matchesApi([unused]))("sofascore-player-966303");
    const [row] = result!.matches;
    expect(row.role).toBe("substitute");
    expect(row.participation).toBe("unknown");
    for (const stat of Object.values(row.stats)) expect(stat).toEqual(missing);
  });

  it.each([
    // played, minutes_played, participation, minutes shown
    [true, 83, "confirmed", { value: 83 }],
    [true, null, "confirmed", missing],
    [null, 30, "confirmed", { value: 30 }],
    [false, 0, "unknown", missing],
    [false, null, "unknown", missing],
    [null, null, "unknown", missing],
    [null, 0, "unknown", missing],
  ])("played=%s with minutes_played=%s → participation %s", async (played, minutes, participation, shown) => {
    const result = await matchesSource(matchesApi([callUp({ played, minutes_played: minutes, statistics: { totalShots: 0 } })]))(
      "sofascore-player-966303",
    );
    expect(result!.matches[0].participation).toBe(participation);
    expect(result!.matches[0].stats.minutes).toEqual(shown);
    if (participation === "unknown") expect(result!.matches[0].stats.shots).toEqual(missing);
  });

  it.each([
    [true, 0],
    [false, 90],
  ])("never settles played=%s against minutes_played=%s: unknown, no stats, logged", async (played, minutes) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await matchesSource(matchesApi([callUp({ played, minutes_played: minutes })]))("sofascore-player-966303");
    const [row] = result!.matches;
    expect(row.participation).toBe("unknown");
    for (const stat of Object.values(row.stats)) expect(stat).toEqual(missing);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("se contradicen"));
  });

  it("keeps omitted stats missing, never 0, when participation is confirmed", async () => {
    const result = await matchesSource(matchesApi([callUp({ statistics: { totalPass: 3, totalShots: 0, minutesPlayed: 22 } })]))(
      "sofascore-player-966303",
    );
    const { stats } = result!.matches[0];
    expect(stats.shots).toEqual({ value: 0 });
    expect(stats.passes).toEqual({ value: 3 });
    for (const key of ["goals", "assists", "xg", "passesCompleted", "rating"] as const) expect(stats[key], key).toEqual(missing);
  });

  it("leaves a team the source cannot name unnamed, never a name from elsewhere", async () => {
    const result = await matchesSource(matchesApi([callUp()], { "2841": "Real Jaén" }))("sofascore-player-966303");
    expect(result!.matches[0].match.home).toEqual({ id: "sofascore-team-135672", name: null });
  });

  it("asks for each team name once", async () => {
    const fetch = matchesApi([callUp(), callUp({ match_id: 2 }, { match_id: 2 })]);
    await matchesSource(fetch)("sofascore-player-966303");
    const teamCalls = fetch.mock.calls.map((call) => String((call as unknown[])[0])).filter((url) => url.includes("/teams/"));
    expect(teamCalls.sort()).toEqual([
      "http://127.0.0.1:8001/api/v1/teams/135672",
      "http://127.0.0.1:8001/api/v1/teams/2841",
    ]);
  });

  it("asks for team names one at a time: the local service refuses concurrent connections", async () => {
    const names = matchesApi([callUp(), callUp({ match_id: 2 }, { match_id: 2, home_team_id: 7 })], { ...TEAM_NAMES, "7": "Otro" });
    let inFlight = 0;
    let most = 0;
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return names(input);
    });
    await matchesSource(fetch)("sofascore-player-966303");
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(most).toBe(1);
  });

  it("gives no score unless the match is finished, and unknown statuses stay unknown", async () => {
    const result = await matchesSource(matchesApi([
      callUp({}, { status: "notstarted", home_score: null, away_score: null }),
      callUp({ match_id: 2 }, { match_id: 2, status: "inprogress" }),
    ]))("sofascore-player-966303");
    expect(result!.matches.map((m) => [m.match.status, m.match.score])).toEqual([["scheduled", null], [null, null]]);
  });

  it("distinguishes an empty list from an unknown player", async () => {
    expect((await matchesSource(matchesApi([]))("sofascore-player-966303"))!.matches).toEqual([]);
    expect(await matchesSource(matchesApi(null))("sofascore-player-1")).toBeNull();
    const fetch = matchesApi([]);
    expect(await matchesSource(fetch)("player-0001")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["no data array", { meta: {} }],
    ["another player", { data: [callUp({ player_id: 1 })] }],
    ["a bad side", { data: [callUp({ side: "neutral" })] }],
    ["a non-numeric stat", { data: [callUp({ statistics: { totalShots: "4" } })] }],
    ["a bad kickoff", { data: [callUp({}, { kickoff_utc: "mañana" })] }],
    ["no team id", { data: [callUp({}, { home_team_id: null })] }],
  ])("rejects a response with %s", async (_case, body) => {
    await expect(matchesSource(answer(body))("sofascore-player-966303")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("fails as unavailable when a team name lookup fails", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/teams/") ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ data: [callUp()] })),
    );
    await expect(matchesSource(fetch)("sofascore-player-966303")).rejects.toThrow("HTTP 500");
  });
});

/** Rows shaped like `GET /api/v1/teams/2841/matches` of the real local API on 2026-10-21. */
const fixture = (overrides: Record<string, unknown> = {}) => ({
  source: "Sofascore", match_id: 16599363, kickoff_utc: "2026-08-30T17:15:00+00:00", status: "finished",
  tournament_id: 94191, competition: "Primera Federacion, Group 2", season_id: 97382, season: "26/27", round: 1,
  home_team_id: 135672, away_team_id: 2841, home_score: 0, away_score: 3, fetched_at: "2026-10-21T12:07:26+00:00",
  available_sections: ["event", "lineups"], ...overrides,
});
const pending = fixture({ match_id: 16599386, kickoff_utc: "2026-11-07T15:30:00+00:00", status: "notstarted",
  round: 11, home_team_id: 24322, away_team_id: 2841, home_score: null, away_score: null });
const cup = fixture({ match_id: 17259821, kickoff_utc: "2026-10-28T19:00:00+00:00", status: "notstarted",
  competition: "Copa del Rey", season_id: 104108, tournament_id: 150, round: 1, home_team_id: 493345,
  home_score: null, away_score: null });
const NAMES: Record<string, string> = { "2841": "Real Jaén", "135672": "CE Europa", "24322": "Sevilla Atlético", "493345": "CD Rival Copa" };

/** Simulated local API for a team's matches and the team names they need. */
function teamApi(rows: unknown[] | null, names: Record<string, string> = NAMES) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const team = /\/api\/v1\/teams\/(\d+)$/.exec(url);
    if (team) {
      return names[team[1]]
        ? new Response(JSON.stringify({ data: { source: "Sofascore", team_id: Number(team[1]), name: names[team[1]] } }))
        : new Response(JSON.stringify({ error: "Entidad no encontrada" }), { status: 404 });
    }
    return rows === null
      ? new Response(JSON.stringify({ error: "Entidad no encontrada" }), { status: 404 })
      : new Response(JSON.stringify({ data: rows, meta: { count: rows.length } }));
  });
}
const teamSource = (fetch: typeof globalThis.fetch) =>
  createLocalApiTeamMatches({ baseUrl: "http://127.0.0.1:8001", fetch });
const urls = (fetch: ReturnType<typeof teamApi>) => fetch.mock.calls.map((call) => String((call as unknown[])[0]));

describe("local API adapter: team matches", () => {
  it("asks for our team's source id and returns its matches by kickoff, with the source's names", async () => {
    const fetch = teamApi([pending, fixture(), cup]);
    const result = await teamSource(fetch)("team-real-jaen");
    expect(urls(fetch)[0]).toBe("http://127.0.0.1:8001/api/v1/teams/2841/matches");
    expect(result!.matches.map((row) => row.match.id)).toEqual([
      "sofascore-match-16599363", "sofascore-match-17259821", "sofascore-match-16599386",
    ]);
    expect(result!.matches[0]).toEqual({
      side: "away",
      match: {
        id: "sofascore-match-16599363", kickoff: "2026-08-30T17:15:00+00:00", status: "finished",
        competition: "Primera Federacion, Group 2", season: "26/27", round: 1,
        home: { id: "sofascore-team-135672", name: "CE Europa" }, away: { id: "team-real-jaen", name: "Real Jaén" },
        score: { home: 0, away: 3 },
      },
    });
    expect(result!.scope).toMatch(/No es necesariamente un calendario completo/);
    expect(result!.source).toEqual({ synthetic: false, label: "Datos reales" });
  });

  it("never gives a pending match a score, even if the source sends one, and keeps unknown statuses unknown", async () => {
    const result = await teamSource(teamApi([
      { ...pending, home_score: 0, away_score: 0 },
      fixture({ match_id: 2, status: "inprogress", kickoff_utc: "2026-09-01T10:00:00+00:00" }),
      fixture({ match_id: 3, home_score: null, away_score: null, kickoff_utc: "2026-09-02T10:00:00+00:00" }),
    ]))("team-real-jaen");
    expect(result!.matches.map(({ match }) => [match.status, match.score])).toEqual([
      [null, null], ["finished", null], ["scheduled", null],
    ]);
  });

  it("puts matches without a date last and keeps missing season or competition missing", async () => {
    const result = await teamSource(teamApi([
      fixture({ match_id: 4, kickoff_utc: null, season: null, competition: null, round: null }), fixture(),
    ]))("team-real-jaen");
    expect(result!.matches.map(({ match }) => [match.id, match.kickoff, match.season, match.competition, match.round])).toEqual([
      ["sofascore-match-16599363", "2026-08-30T17:15:00+00:00", "26/27", "Primera Federacion, Group 2", 1],
      ["sofascore-match-4", null, null, null, null],
    ]);
  });

  it("has nothing for a team without explicit correspondence, and does not call the API", async () => {
    const fetch = teamApi([fixture()]);
    expect(await teamSource(fetch)("team-montealto")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("distinguishes an empty list from a team the source does not know", async () => {
    expect((await teamSource(teamApi([]))("team-real-jaen"))!.matches).toEqual([]);
    expect(await teamSource(teamApi(null))("team-real-jaen")).toBeNull();
  });

  it.each([
    ["no data array", { meta: {} }],
    ["a match without our team", { data: [fixture({ away_team_id: 7 })] }],
    ["a bad kickoff", { data: [fixture({ kickoff_utc: "pronto" })] }],
    ["a non-numeric score", { data: [fixture({ home_score: "0" })] }],
    ["no match id", { data: [fixture({ match_id: null })] }],
  ])("rejects a response with %s", async (_case, body) => {
    await expect(teamSource(answer(body))("team-real-jaen")).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("reuses resolved team names across lists, one request at a time, without keeping failures", async () => {
    const first = teamApi([fixture(), pending]);
    await teamSource(first)("team-real-jaen");
    expect(urls(first).filter((url) => url.includes("/teams/") && !url.endsWith("/matches"))).toHaveLength(3);

    // A player's call-ups share those teams: no new name requests.
    const again = matchesApi([callUp()], {});
    await matchesSource(again)("sofascore-player-966303");
    expect(urls(again as unknown as ReturnType<typeof teamApi>).filter((url) => url.includes("/teams/"))).toEqual([]);

    clearTeamNameCache();
    const failing = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/matches") ? new Response(JSON.stringify({ data: [fixture()] })) : new Response("{}", { status: 500 }));
    await expect(teamSource(failing)("team-real-jaen")).rejects.toThrow("HTTP 500");
    const recovered = teamApi([fixture()]);
    await teamSource(recovered)("team-real-jaen");
    expect(urls(recovered).filter((url) => !url.endsWith("/matches")).length).toBeGreaterThan(0);
  });
});

/** Shapes of the real local API's /matches/{id} and /matches/{id}/statistics on 2026-10-21 (trimmed). */
const matchBody = (overrides: Record<string, unknown> = {}) => ({
  data: { ...fixture(), home_team_name: "CE Europa", away_team_name: "Real Jaén", ...overrides },
  meta: { sections: { statistics: "stored", lineups: "stored", incidents: "stored" } },
});
const item = (key: string, homeValue: unknown, awayValue: unknown) => ({ key, name: key, home: String(homeValue), away: String(awayValue), homeValue, awayValue });
const statsBody = (availability = "stored", groups?: unknown[]) => ({
  data: availability === "not_stored" ? null : availability === "empty" ? { statistics: [] } : {
    statistics: [
      { period: "ALL", groups: groups ?? [
        { groupName: "Match overview", statisticsItems: [item("ballPossession", 46, 54), item("expectedGoals", 1.81, 1.6),
          item("cornerKicks", 3, 3), item("fouls", 13, 5), item("totalShotsOnGoal", 15, 13), item("yellowCards", 0, 1)] },
        { groupName: "Shots", statisticsItems: [item("totalShotsOnGoal", 99, 99), item("shotsOnGoal", 4, 5)] },
      ] },
      { period: "1ST", groups: [{ groupName: "Match overview", statisticsItems: [item("ballPossession", 1, 99)] }] },
    ],
  },
  meta: { match_id: 16599363, section: "statistics", source: "Sofascore", source_key: "statistics", availability,
    fetched_at: availability === "not_stored" ? null : "2026-10-21T12:07:30+00:00", versions: availability === "not_stored" ? 0 : 1 },
});

/** Simulated local API for a match and its statistics. */
/** Shape of the real local API's /matches/{id}/lineups (trimmed): a starter with minutes, an unused substitute. */
const lineupEntry = (id: number, name: string, overrides: Record<string, unknown> = {}) => ({
  player: { name, id, position: "M", shortName: name, country: { name: "Spain" } }, teamId: 135672,
  shirtNumber: id % 30, jerseyNumber: String(id % 30), position: "M", substitute: false,
  statistics: { minutesPlayed: 90, totalShots: 1, rating: 7 }, ...overrides,
});
const benchEntry = (id: number, name: string) =>
  lineupEntry(id, name, { substitute: true, statistics: { totalShots: 0, statisticsType: { sportSlug: "football", statisticsType: "player" } } });
const eleven = (first: number) => Array.from({ length: 11 }, (_, i) => lineupEntry(first + i, `Titular ${first + i}`));
const lineupsBody = (availability = "stored", data?: unknown) => ({
  data: availability === "not_stored" ? null : data ?? {
    confirmed: true, statisticalVersion: 3,
    home: { players: [...eleven(100), benchEntry(200, "Suplente Local")], formation: "4-4-2", supportStaff: [], playerColor: {} },
    away: { players: [...eleven(300), lineupEntry(400, "Entra", { substitute: true, statistics: { minutesPlayed: 22 } })], formation: "4-3-3" },
  },
  meta: { section: "lineups", availability, fetched_at: availability === "not_stored" ? null : "2026-10-21T12:07:31+00:00" },
});

/** Shape of the real local API's /matches/{id}/incidents (trimmed): kinds seen on 2026-10-21, plus cases it may send. */
const incidentsBody = (availability = "stored", incidents?: unknown[]) => ({
  data: availability === "not_stored" ? null : { incidents: incidents ?? [
    { text: "FT", homeScore: 0, awayScore: 3, time: 90, addedTime: 999, incidentType: "period" },
    { playerIn: { id: 1594459, name: "Guillem Cardelus" }, playerOut: { id: 857907, name: "Gori Gracia" }, id: 1, time: 90,
      addedTime: 2, injury: false, isHome: true, incidentClass: "regular", incidentType: "substitution" },
    { homeScore: 0, awayScore: 3, player: { id: 966303, name: "Moha Keita" }, assist1: { id: 1545211, name: "David Serrano" },
      id: 2, time: 77, isHome: false, incidentClass: "regular", incidentType: "goal" },
    { from: "penalty", player: { id: 942663, name: "Marco Siverio Toro" }, id: 3, time: 88, isHome: false, incidentClass: "penalty", incidentType: "goal" },
    { player: { id: 175409, name: "Javi Moyano" }, id: 4, time: 45, addedTime: 6, incidentClass: "yellowRed", incidentType: "card" },
    { player: { id: 964890, name: "Andy Escudero" }, id: 5, time: 64, incidentClass: "missed", incidentType: "inGamePenalty" },
    { confirmed: true, player: { id: 848589, name: "Moha Sanhaji" }, id: 6, time: 13, incidentClass: "goalAwarded", incidentType: "varDecision" },
  ], home: {}, away: {} },
  meta: { section: "incidents", availability, fetched_at: availability === "not_stored" ? null : "2026-10-21T12:07:31+00:00" },
});

function detailApi(match: unknown, stats: unknown | (() => Response), lineups: unknown | (() => Response) = lineupsBody("not_stored"),
  incidents: unknown | (() => Response) = incidentsBody("not_stored")) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/incidents")) {
      return typeof incidents === "function" ? (incidents as () => Response)() : new Response(JSON.stringify(incidents));
    }
    if (url.endsWith("/statistics")) {
      return typeof stats === "function" ? (stats as () => Response)() : new Response(JSON.stringify(stats));
    }
    if (url.endsWith("/lineups")) {
      return typeof lineups === "function" ? (lineups as () => Response)() : new Response(JSON.stringify(lineups));
    }
    return match === null ? new Response(JSON.stringify({ error: "Partido no encontrado" }), { status: 404 })
      : new Response(JSON.stringify(match));
  });
}
const detailSource = (fetch: typeof globalThis.fetch) => createLocalApiMatchDetail({ baseUrl: "http://127.0.0.1:8001", fetch });

describe("local API adapter: real match detail", () => {
  it("reads only ids derived from the source: a synthetic id is never taken as real", async () => {
    expect(sourceMatchId("sofascore-match-16599363")).toBe(16599363);
    for (const id of ["match-r01-01", "sofascore-match-", "sofascore-match-01", "sofascore-player-1"]) expect(sourceMatchId(id), id).toBeNull();
    const fetch = detailApi(matchBody(), statsBody());
    expect(await detailSource(fetch)("match-r01-01")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the match with the source's names and the ALL-period team stats, missing ones unknown", async () => {
    const fetch = detailApi(matchBody(), statsBody());
    const result = await detailSource(fetch)("sofascore-match-16599363");
    expect(fetch.mock.calls.map((call) => String((call as unknown[])[0]))).toEqual([
      "http://127.0.0.1:8001/api/v1/matches/16599363", "http://127.0.0.1:8001/api/v1/matches/16599363/statistics",
      "http://127.0.0.1:8001/api/v1/matches/16599363/lineups", "http://127.0.0.1:8001/api/v1/matches/16599363/incidents",
    ]);
    expect(result!.match).toEqual({
      id: "sofascore-match-16599363", kickoff: "2026-08-30T17:15:00+00:00", status: "finished",
      competition: "Primera Federacion, Group 2", season: "26/27", round: 1,
      home: { id: "sofascore-team-135672", name: "CE Europa" }, away: { id: "team-real-jaen", name: "Real Jaén" },
      score: { home: 0, away: 3 },
    });
    expect(result!.statistics).toEqual({
      state: "stored", fetchedAt: "2026-10-21T12:07:30+00:00",
      home: { possession: { value: 46 }, shots: { value: 15 }, shotsOnTarget: { value: 4 }, xg: { value: 1.81 },
        corners: { value: 3 }, fouls: { value: 13 }, yellowCards: { value: 0 }, redCards: missing },
      away: { possession: { value: 54 }, shots: { value: 13 }, shotsOnTarget: { value: 5 }, xg: { value: 1.6 },
        corners: { value: 3 }, fouls: { value: 5 }, yellowCards: { value: 1 }, redCards: missing },
    });
    expect(result!.source).toEqual({ synthetic: false, label: "Datos reales" });
  });

  it("distinguishes empty and not stored statistics, and a pending match keeps no score", async () => {
    const empty = await detailSource(detailApi(matchBody(), statsBody("empty")))("sofascore-match-16599363");
    expect(empty!.statistics).toEqual({ state: "empty", fetchedAt: "2026-10-21T12:07:30+00:00" });
    const pendingDetail = await detailSource(detailApi(
      matchBody({ ...pending, home_team_name: "Sevilla Atlético", away_team_name: "Real Jaén" }), statsBody("not_stored"),
    ))("sofascore-match-16599386");
    expect(pendingDetail!.statistics).toEqual({ state: "not_stored", fetchedAt: null });
    expect([pendingDetail!.match.status, pendingDetail!.match.score]).toEqual(["scheduled", null]);
  });

  it("keeps the header when the statistics cannot be read, with an error state", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const stats of [
      () => new Response("{}", { status: 500 }),
      () => { throw new TypeError("fetch failed"); },
      () => new Response(JSON.stringify({ data: null, meta: { availability: "unknown" } })),
      () => new Response(JSON.stringify(statsBody("stored", [{ statisticsItems: [item("fouls", "13", 5)] }]))),
      () => new Response(JSON.stringify({ error: "Partido no encontrado" }), { status: 404 }),
    ]) {
      const result = await detailSource(detailApi(matchBody(), stats))("sofascore-match-16599363");
      expect(result!.statistics).toEqual({ state: "error", fetchedAt: null });
      expect(result!.match.home.name).toBe("CE Europa");
    }
  });

  it("has nothing for a match the source does not know, and fails as unavailable when the match cannot be read", async () => {
    expect(await detailSource(detailApi(null, statsBody()))("sofascore-match-1")).toBeNull();
    await expect(detailSource(detailApi({ data: { match_id: 1 } }, statsBody()))("sofascore-match-1")).rejects.toBeInstanceOf(UpstreamUnavailableError);
    await expect(detailSource(answer({}, 500))("sofascore-match-1")).rejects.toThrow("HTTP 500");
  });

  it("keeps a team name the source does not give as unknown", async () => {
    const result = await detailSource(detailApi(matchBody({ home_team_name: null }), statsBody()))("sofascore-match-16599363");
    expect(result!.match.home).toEqual({ id: "sofascore-team-135672", name: null });
  });
});

describe("local API adapter: real line-ups", () => {
  const detail = (lineups: unknown | (() => Response)) =>
    detailSource(detailApi(matchBody(), statsBody(), lineups))("sofascore-match-16599363");

  it("keeps each side apart, the source's order, role flag, shirt number and confirmation", async () => {
    const { lineups } = (await detail(lineupsBody()))!;
    if (lineups.state !== "stored") throw new Error("expected stored line-ups");
    expect([lineups.confirmed, lineups.fetchedAt, lineups.home.length, lineups.away.length]).toEqual([true, "2026-10-21T12:07:31+00:00", 12, 12]);
    expect(lineups.home[0]).toEqual({
      player: { id: "sofascore-player-100", name: "Titular 100", position: "midfielder" },
      shirtNumber: 10, role: "starter", participation: "confirmed", minutes: { value: 90 },
    });
    // A named substitute with only { totalShots: 0 } did not necessarily play: unknown, no minutes.
    expect(lineups.home[11]).toEqual({
      player: { id: "sofascore-player-200", name: "Suplente Local", position: "midfielder" },
      shirtNumber: 20, role: "substitute", participation: "unknown", minutes: missing,
    });
    expect(lineups.away[11]).toMatchObject({ role: "substitute", participation: "confirmed", minutes: { value: 22 } });
  });

  it("never guesses a missing role, shirt number or confirmation", async () => {
    const { lineups } = (await detail(lineupsBody("stored", {
      home: { players: [lineupEntry(1, "Sin Rol", { substitute: undefined, shirtNumber: null, statistics: undefined })] },
    })))!;
    if (lineups.state !== "stored") throw new Error("expected stored line-ups");
    expect(lineups.confirmed).toBeNull();
    expect(lineups.home).toEqual([{
      player: { id: "sofascore-player-1", name: "Sin Rol", position: "midfielder" },
      shirtNumber: null, role: null, participation: "unknown", minutes: missing,
    }]);
    expect(lineups.away).toEqual([]);
  });

  it("leaves unknown a player whose minutes are 0", async () => {
    const { lineups } = (await detail(lineupsBody("stored", { home: { players: [lineupEntry(1, "Cero", { statistics: { minutesPlayed: 0 } })] } })))!;
    if (lineups.state !== "stored") throw new Error("expected stored line-ups");
    expect(lineups.home[0]).toMatchObject({ participation: "unknown", minutes: missing });
  });

  it("distinguishes empty, not stored and a failed query, keeping the rest of the detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await detail(lineupsBody("empty", { confirmed: false, home: { players: [] }, away: { players: [] } })))!.lineups)
      .toEqual({ state: "empty", fetchedAt: "2026-10-21T12:07:31+00:00" });
    expect((await detail(lineupsBody("not_stored")))!.lineups).toEqual({ state: "not_stored", fetchedAt: null });
    for (const failing of [
      () => new Response("{}", { status: 500 }),
      () => new Response(JSON.stringify(lineupsBody("stored", { home: { players: [{ player: { name: "Sin id" } }] } }))),
      () => new Response(JSON.stringify(lineupsBody("stored", { confirmed: "sí", home: { players: [] } }))),
      () => new Response(JSON.stringify(lineupsBody("stored", { home: { players: [lineupEntry(1, "X", { substitute: "no" })] } }))),
    ]) {
      const result = (await detail(failing))!;
      expect(result.lineups).toEqual({ state: "error", fetchedAt: null });
      expect(result.statistics.state).toBe("stored");
      expect(result.match.home.name).toBe("CE Europa");
    }
  });
});

describe("local API adapter: real incidents", () => {
  const detail = (incidents: unknown | (() => Response)) =>
    detailSource(detailApi(matchBody(), statsBody(), lineupsBody(), incidents))("sofascore-match-16599363");

  it("keeps only goals (with their kind and named assistant) and substitutions, as recorded", async () => {
    const { incidents } = (await detail(incidentsBody()))!;
    if (incidents.state !== "stored") throw new Error("expected stored incidents");
    expect(incidents.fetchedAt).toBe("2026-10-21T12:07:31+00:00");
    expect(incidents.goals).toEqual([
      { kind: "regular", minute: 77, addedTime: null,
        scorer: { id: "sofascore-player-966303", name: "Moha Keita", position: null },
        assist: { id: "sofascore-player-1545211", name: "David Serrano", position: null } },
      { kind: "penalty", minute: 88, addedTime: null,
        scorer: { id: "sofascore-player-942663", name: "Marco Siverio Toro", position: null }, assist: null },
    ]);
    // Cards, VAR, periods and missed penalties are not goals nor substitutions.
    expect(incidents.substitutions).toEqual([{ minute: 90, addedTime: 2,
      playerIn: { id: "sofascore-player-1594459", name: "Guillem Cardelus", position: null },
      playerOut: { id: "sofascore-player-857907", name: "Gori Gracia", position: null } }]);
  });

  it("tells own goals and unknown kinds apart, and leaves shoot-out kicks out", async () => {
    const { incidents } = (await detail(incidentsBody("stored", [
      { player: { id: 1, name: "Propia" }, assist1: { id: 2, name: "Nadie" }, time: 10, incidentClass: "ownGoal", incidentType: "goal" },
      { player: { id: 3, name: "Rara" }, time: 20, incidentClass: "otraCosa", incidentType: "goal" },
      { player: { id: 4, name: "Tanda" }, incidentClass: "scored", incidentType: "penaltyShootout" },
      { player: null, time: 30, incidentClass: "regular", incidentType: "goal" },
    ])))!;
    if (incidents.state !== "stored") throw new Error("expected stored incidents");
    expect(incidents.goals.map((g) => [g.kind, g.scorer?.name ?? null, g.assist?.name ?? null])).toEqual([
      ["ownGoal", "Propia", "Nadie"], ["unknown", "Rara", null], ["regular", null, null],
    ]);
  });

  it("distinguishes empty, not stored and a failed query, keeping line-ups and stats", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await detail(incidentsBody("empty", [])))!.incidents).toEqual({ state: "empty", fetchedAt: "2026-10-21T12:07:31+00:00" });
    expect((await detail(incidentsBody("not_stored")))!.incidents).toEqual({ state: "not_stored", fetchedAt: null });
    for (const failing of [
      () => new Response("{}", { status: 500 }),
      () => new Response(JSON.stringify(incidentsBody("stored", [{ player: { id: "x" }, incidentType: "goal" }]))),
      () => new Response(JSON.stringify({ data: { incidents: "no" }, meta: { availability: "stored" } })),
    ]) {
      const result = (await detail(failing))!;
      expect(result.incidents).toEqual({ state: "error", fetchedAt: null });
      expect(result.lineups.state).toBe("stored");
      expect(result.statistics.state).toBe("stored");
    }
  });
});
