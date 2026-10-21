// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLocalApiObservedPlayers,
  createLocalApiObservedMatches,
  createLocalApiPlayerProfile,
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
      participation: "confirmed",
      stats: {
        minutes: { value: 83 }, goals: { value: 1 }, assists: { value: 0 }, shots: { value: 4 },
        xg: { value: 0.454 }, passesCompleted: { value: 19 }, passes: { value: 24 }, rating: { value: 7.4 },
      },
    });
    expect(result!.ratingSource).toBe("SofaScore");
    expect(result!.source).toEqual({ synthetic: false, label: "Datos reales" });
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8001/api/v1/players/966303/matches", expect.anything());
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
