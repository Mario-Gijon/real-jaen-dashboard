import {
  OBSERVED_MATCH_STAT_KEYS,
  TEAM_STAT_KEYS,
  type MatchStatus,
  type ObservedMatch,
  type ObservedGoal,
  type ObservedLineupPlayer,
  type ObservedMatchDetail,
  type ObservedMatchStatKey,
  type ObservedPlayerMatch,
  type ObservedPlayerMatches,
  type ObservedPlayers,
  type ObservedSubstitution,
  type ObservedCompetition,
  type ObservedTeam,
  type ObservedTeamMatches,
  type PlayerPosition,
  type PlayerProfile,
  type PlayerRef,
  type PreferredFoot,
  type Stat,
  type TeamMatchStats,
  type TeamStatKey,
} from "@/contract";

/**
 * Adapter over the local data API (a separate service on the analyst's
 * machine, today backed by SofaScore). Only this module knows its URLs, its
 * ids and its vocabulary; it returns contract types or throws
 * {@link UpstreamUnavailableError}. Nothing is completed with synthetic data.
 */

/**
 * Our team ids and their ids in the source. Explicit on purpose: a team
 * without an entry has no real data, and nothing is ever matched by name.
 */
const SOURCE_TEAM_IDS: Readonly<Record<string, number>> = {
  "team-real-jaen": 2841,
};

const PLAYER_ID_PREFIX = "sofascore-player-";

/** Our id for a source team: the explicit one when mapped, else one derived from the provider's. */
function teamIdFromSource(sourceId: number): string {
  const mapped = Object.entries(SOURCE_TEAM_IDS).find(([, id]) => id === sourceId);
  return mapped ? mapped[0] : `sofascore-team-${sourceId}`;
}

const MATCH_ID_PREFIX = "sofascore-match-";
const matchIdFromSource = (sourceId: number) => `${MATCH_ID_PREFIX}${sourceId}`;

/** The provider's id behind one of our derived match ids; `null` for any other id (e.g. a synthetic one). */
export function sourceMatchId(matchId: string): number | null {
  if (!matchId.startsWith(MATCH_ID_PREFIX)) return null;
  const digits = matchId.slice(MATCH_ID_PREFIX.length);
  if (!/^[1-9]\d*$/.test(digits)) return null;
  const id = Number(digits);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Public player id derived from the provider's id. Stable while this provider
 * is used, but NOT an identity independent of it: another source would need
 * an explicit correspondence.
 */
export const playerIdFromSource = (sourceId: number) => `${PLAYER_ID_PREFIX}${sourceId}`;

/** The provider's id behind one of our derived ids; `null` for any other id. */
export function sourcePlayerId(playerId: string): number | null {
  if (!playerId.startsWith(PLAYER_ID_PREFIX)) return null;
  const digits = playerId.slice(PLAYER_ID_PREFIX.length);
  if (!/^[1-9]\d*$/.test(digits)) return null;
  const id = Number(digits);
  return Number.isSafeInteger(id) ? id : null;
}

/** Source position letters; anything else is unknown, never guessed. */
const POSITIONS: Readonly<Record<string, PlayerPosition>> = {
  G: "goalkeeper",
  D: "defender",
  M: "midfielder",
  F: "forward",
};

/** Source foot values, case-insensitive; anything else is unknown. */
const FEET: Readonly<Record<string, PreferredFoot>> = {
  left: "left",
  right: "right",
  both: "both",
};

const PROVENANCE = { synthetic: false, label: "Datos reales" } as const;

const PROFILE_SCOPE = "Datos personales según la fuente. No indican equipo actual.";

const MATCHES_SCOPE =
  "Partidos en los que la fuente registra al jugador en la convocatoria. No garantiza cobertura completa ni indica equipo actual. Sin participación confirmada no se muestran minutos ni estadísticas.";

const MATCH_DETAIL_SCOPE =
  "Partido, estadísticas colectivas, alineaciones e incidencias según la fuente. Un dato que la fuente no da se muestra como «—».";

/**
 * The source's key (period `ALL` of `statistics`) behind each team stat. A key
 * the source omits (e.g. `redCards` in most matches) stays missing, never 0.
 */
const TEAM_STAT_FIELDS: Readonly<Record<TeamStatKey, string>> = {
  possession: "ballPossession",
  shots: "totalShotsOnGoal",
  shotsOnTarget: "shotsOnGoal",
  xg: "expectedGoals",
  corners: "cornerKicks",
  fouls: "fouls",
  yellowCards: "yellowCards",
  redCards: "redCards",
};

const TEAM_MATCHES_SCOPE =
  "Partidos del equipo que registra la fuente. No es necesariamente un calendario completo.";

/** The provider behind `rating`, named so the analyst knows whose rating it is. */
const RATING_SOURCE = "SofaScore";

/** Source match statuses the app knows; anything else is unknown. */
const STATUSES: Readonly<Record<string, MatchStatus>> = {
  finished: "finished",
  notstarted: "scheduled",
  postponed: "postponed",
};

/** Where each stat comes from in the source's `statistics` object. */
const STAT_FIELDS: Readonly<Record<Exclude<ObservedMatchStatKey, "minutes">, string>> = {
  goals: "goals",
  assists: "goalAssist",
  shots: "totalShots",
  // totalShots = onTargetScoringAttempt + shotOffTarget + blockedScoringAttempt in the stored data.
  shotsOnTarget: "onTargetScoringAttempt",
  xg: "expectedGoals",
  passesCompleted: "accuratePass",
  passes: "totalPass",
  dribbles: "totalContest",
  dribblesWon: "wonContest",
  recoveries: "ballRecovery",
  possessionLost: "possessionLostCtrl",
  duelsWon: "duelWon",
  duelsLost: "duelLost",
  fouls: "fouls",
  saves: "saves",
  rating: "rating",
};

const NOT_AVAILABLE: Stat = { value: null, reason: "not_available" };

export const DEFAULT_TIMEOUT_MS = 5000;

/** The local API did not answer, failed or answered something unusable. */
export class UpstreamUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UpstreamUnavailableError";
  }
}

type Options = { baseUrl: string; timeoutMs?: number; fetch?: typeof fetch };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalid = (detail: string) => new UpstreamUnavailableError(`Respuesta no válida: ${detail}`);

/** `null` or absent stays unknown; any other non-text value makes the response invalid. */
function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw invalid(field);
  return value.trim() || null;
}

/** A positive integer id, or an invalid response. */
function positiveId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw invalid(field);
  return value;
}

/** A finite number, `null` when absent; anything else makes the response invalid. */
function optionalNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalid(field);
  return value;
}

/** Position as the source letter, or unknown. */
function position(value: unknown, field: string): PlayerPosition | null {
  const letter = optionalText(value, field);
  return (letter && POSITIONS[letter]) || null;
}

/**
 * GET against the local API: the parsed body, or `null` for 404. Any other
 * failure, timeout or non-JSON body is an {@link UpstreamUnavailableError}.
 */
async function getJson(
  { fetch: fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }: Options,
  url: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    throw new UpstreamUnavailableError(
      timedOut ? `Sin respuesta en ${timeoutMs} ms: ${url}` : `Sin conexión con ${url}`,
      { cause },
    );
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new UpstreamUnavailableError(`HTTP ${response.status} en ${url}`);
  try {
    return await response.json();
  } catch (cause) {
    throw new UpstreamUnavailableError(`Respuesta no JSON en ${url}`, { cause });
  }
}

const baseOf = ({ baseUrl }: Options) => baseUrl.replace(/\/+$/, "");

/** Checks the whole body before using any of it: a malformed row fails the request. */
function parsePlayers(body: unknown): { players: PlayerRef[]; scope: string } {
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(body.meta)) {
    throw invalid("se esperaba { data: [], meta: {} }");
  }
  const { scope, count } = body.meta;
  if (typeof scope !== "string" || !scope.trim()) throw invalid("meta.scope ausente");

  const seen = new Set<number>();
  const players = body.data.map((row, index): PlayerRef => {
    if (!isRecord(row)) throw invalid(`data[${index}] no es un objeto`);
    const { player_id: id, name } = row;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      throw invalid(`data[${index}].player_id`);
    }
    if (seen.has(id)) throw invalid(`player_id ${id} repetido`);
    seen.add(id);
    if (typeof name !== "string" || !name.trim()) throw invalid(`data[${index}].name`);
    return {
      id: playerIdFromSource(id),
      name: name.trim(),
      position: position(row.usual_position, `data[${index}].usual_position`),
    };
  });
  if (count !== undefined && count !== players.length) {
    console.warn(`API local: meta.count (${String(count)}) ≠ ${players.length} jugadores recibidos.`);
  }
  return { players, scope: scope.trim() };
}

/**
 * Personal data only. Fields the dashboard does not show (the provider's
 * name, the download time `fetched_at`) are ignored: the download time says
 * nothing about when the profile itself changed.
 */
function parseProfile(body: unknown, sourceId: number): PlayerProfile["player"] {
  if (!isRecord(body) || !isRecord(body.data)) throw invalid("se esperaba { data: {} }");
  const row = body.data;
  if (row.player_id !== sourceId) throw invalid("player_id no coincide con el solicitado");
  if (typeof row.name !== "string" || !row.name.trim()) throw invalid("name");

  const birthDate = optionalText(row.birth_date, "birth_date");
  if (birthDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw invalid("birth_date");
  const height = row.height_cm;
  if (height !== undefined && height !== null && !(Number.isInteger(height) && (height as number) > 0)) {
    throw invalid("height_cm");
  }
  const foot = optionalText(row.preferred_foot, "preferred_foot");
  return {
    id: playerIdFromSource(sourceId),
    name: row.name.trim(),
    position: position(row.usual_position, "usual_position"),
    birthDate,
    heightCm: typeof height === "number" ? height : null,
    preferredFoot: (foot && FEET[foot.toLowerCase()]) || null,
    country: optionalText(row.country, "country"),
  };
}

/**
 * `observedPlayers` against the local API. `null` when the team has no
 * correspondence in the source or the source does not know it.
 */
export function createLocalApiObservedPlayers(options: Options) {
  return async (teamId: string): Promise<ObservedPlayers | null> => {
    const sourceId = SOURCE_TEAM_IDS[teamId];
    if (sourceId === undefined) return null;
    const body = await getJson(options, `${baseOf(options)}/api/v1/teams/${sourceId}/players`);
    return body === null ? null : { teamId, ...parsePlayers(body), source: PROVENANCE };
  };
}

/**
 * `playerProfile` against the local API. `null` for an id that is not one of
 * ours derived from this source, or a player the source does not know.
 */
export function createLocalApiPlayerProfile(options: Options) {
  return async (playerId: string): Promise<PlayerProfile | null> => {
    const sourceId = sourcePlayerId(playerId);
    if (sourceId === null) return null;
    const body = await getJson(options, `${baseOf(options)}/api/v1/players/${sourceId}`);
    if (body === null) return null;
    return { player: parseProfile(body, sourceId), scope: PROFILE_SCOPE, source: PROVENANCE };
  };
}

/** A competition the local API serves, with the source ids that identify its matches. */
type SourceCompetition = ObservedCompetition & { tournamentId: number; seasonId: number };

/**
 * The competitions the local API serves (`GET /api/v1/scope`): one group of a
 * competition in one season each. The service filters by them; a service that
 * does not declare its scope is unusable, never assumed to serve everything.
 */
async function sourceScope(options: Options): Promise<SourceCompetition[]> {
  const body = await getJson(options, `${baseOf(options)}/api/v1/scope`);
  if (body === null) throw new UpstreamUnavailableError("La API local no declara su ámbito (/api/v1/scope).");
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.competitions) || !body.data.competitions.length) {
    throw invalid("se esperaba { data: { competitions: [...] } }");
  }
  return body.data.competitions.map((entry, index) => {
    const at = (field: string) => `data.competitions[${index}].${field}`;
    if (!isRecord(entry)) throw invalid(`data.competitions[${index}]`);
    const name = optionalText(entry.name, at("name"));
    if (name === null) throw invalid(at("name"));
    return { name, season: optionalText(entry.season, at("season")),
      tournamentId: positiveId(entry.tournament_id, at("tournament_id")), seasonId: positiveId(entry.season_id, at("season_id")) };
  });
}

/** A match the service returned outside its own scope makes the whole answer invalid: it is never shown. */
function assertInScope(match: Record<string, unknown>, scope: readonly SourceCompetition[], at: (field: string) => string) {
  if (!scope.some((c) => c.tournamentId === match.tournament_id && c.seasonId === match.season_id)) {
    throw invalid(`${at("tournament_id")}: partido fuera del ámbito declarado`);
  }
}

/** A match before its team names are resolved. */
type RawMatch = Omit<ObservedMatch, "home" | "away"> & { homeId: number; awayId: number };
type RawObservedMatch = Omit<ObservedPlayerMatch, "match"> & { match: RawMatch };

/**
 * A source match object (in a player's call-ups or a team's matches). The
 * score is kept only for a finished match, so a pending one never reads 0–0;
 * an unknown status stays unknown.
 */
function parseMatch(match: Record<string, unknown>, id: number, at: (field: string) => string): RawMatch {
  if (match.match_id !== undefined && match.match_id !== id) throw invalid(at("match_id"));
  const kickoff = optionalText(match.kickoff_utc, at("kickoff_utc"));
  if (kickoff !== null && Number.isNaN(Date.parse(kickoff))) throw invalid(at("kickoff_utc"));
  const status = optionalText(match.status, at("status"));
  const known = (status && STATUSES[status]) || null;
  const round = optionalNumber(match.round, at("round"));
  const homeScore = optionalNumber(match.home_score, at("home_score"));
  const awayScore = optionalNumber(match.away_score, at("away_score"));
  return {
    id: matchIdFromSource(id),
    kickoff,
    status: known,
    competition: optionalText(match.competition, at("competition")),
    season: optionalText(match.season, at("season")),
    round: round !== null && Number.isInteger(round) ? round : null,
    homeId: positiveId(match.home_team_id, at("home_team_id")),
    awayId: positiveId(match.away_team_id, at("away_team_id")),
    score:
      known === "finished" && homeScore !== null && awayScore !== null
        ? { home: homeScore, away: awayScore }
        : null,
  };
}

/**
 * Whether the source confirms the player took part, from `played` and the
 * minutes. A `statistics` object alone proves nothing (the source sends
 * `{ totalShots: 0 }` for unused substitutes).
 *
 * | played        | minutes      | participation                      |
 * |---------------|--------------|------------------------------------|
 * | true          | > 0 or none  | confirmed                          |
 * | absent / null | > 0          | confirmed (minutes imply it)       |
 * | false         | 0 or none    | unknown (never "did not play")     |
 * | absent / null | 0 or none    | unknown                            |
 * | true          | 0            | unknown: contradiction, logged     |
 * | false         | > 0          | unknown: contradiction, logged     |
 *
 * A contradiction is never settled by picking one field.
 */
function participationOf(played: unknown, minutes: number | null, where: string): boolean {
  const someMinutes = minutes !== null && minutes > 0;
  if ((played === true && minutes === 0) || (played === false && someMinutes)) {
    console.warn(`API local: ${where}: played=${String(played)} y minutes=${minutes} se contradicen; participación desconocida.`);
    return false;
  }
  return played === true || (played !== false && someMinutes);
}

/**
 * One call-up row. Without confirmed participation (see `participationOf`)
 * every stat stays missing. Omitted stats are missing, never 0.
 */
function parseMatchRow(row: unknown, index: number, playerSourceId: number, scope: readonly SourceCompetition[]): RawObservedMatch {
  const at = (field: string) => `data[${index}].${field}`;
  if (!isRecord(row) || !isRecord(row.match)) throw invalid(`data[${index}]`);
  if (row.player_id !== playerSourceId) throw invalid(at("player_id"));
  const id = positiveId(row.match_id, at("match_id"));
  if (row.side !== "home" && row.side !== "away") throw invalid(at("side"));
  for (const flag of ["substitute", "played"] as const) {
    const value = row[flag];
    if (value !== undefined && value !== null && typeof value !== "boolean") throw invalid(at(flag));
  }
  const statistics = row.statistics ?? null;
  if (statistics !== null && !isRecord(statistics)) throw invalid(at("statistics"));

  assertInScope(row.match, scope, (field) => at(`match.${field}`));
  const match = parseMatch(row.match, id, (field) => at(`match.${field}`));

  const minutes =
    optionalNumber(row.minutes_played, at("minutes_played")) ??
    (statistics ? optionalNumber(statistics.minutesPlayed, at("statistics.minutesPlayed")) : null);
  const confirmed = participationOf(row.played, minutes, `partido ${id}`);
  const stats = {} as Record<ObservedMatchStatKey, Stat>;
  for (const key of OBSERVED_MATCH_STAT_KEYS) {
    const field = key === "minutes" ? null : STAT_FIELDS[key];
    const value = field === null
      ? minutes
      : statistics ? optionalNumber(statistics[field], at(`statistics.${field}`)) : null;
    stats[key] = confirmed && value !== null ? { value } : NOT_AVAILABLE;
  }

  return {
    match,
    side: row.side,
    role: row.substitute === true ? "substitute" : row.substitute === false ? "starter" : null,
    position: position(row.match_position, at("match_position")),
    participation: confirmed ? "confirmed" : "unknown",
    stats,
  };
}

/** By kickoff (newest first when `newest`); matches without a date always go last. */
function byKickoff(newest: boolean) {
  return (a: { match: RawMatch }, b: { match: RawMatch }): number => {
    if (a.match.kickoff === b.match.kickoff) return a.match.id.localeCompare(b.match.id);
    if (a.match.kickoff === null) return 1;
    if (b.match.kickoff === null) return -1;
    const order = Date.parse(a.match.kickoff) - Date.parse(b.match.kickoff);
    return newest ? -order : order;
  };
}

/** How long a resolved team name is reused before asking the source again. */
const TEAM_NAME_TTL_MS = 60 * 60 * 1000;
/** Resolved names by service URL and team id, shared by every request of this server process. */
const teamNameCache = new Map<string, { name: string | null; expires: number }>();

/** Forgets every resolved team name (tests start from a clean cache). */
export function clearTeamNameCache() {
  teamNameCache.clear();
}

/**
 * Team names as the source gives them (`GET /api/v1/teams/{id}`). A team the
 * source does not know keeps `name: null`; never a name from elsewhere.
 * Resolved names (and unknown teams) are reused for an hour, so lists that
 * share teams do not ask again; failures are not kept. One request at a time:
 * the local service refused connections (ECONNREFUSED) with about ten at
 * once. The cause is still to be investigated (the service already uses
 * ThreadingHTTPServer); see README.
 */
async function teamNames(options: Options, ids: readonly number[]): Promise<Map<number, string | null>> {
  const names = new Map<number, string | null>();
  for (const id of new Set(ids)) {
    const key = `${baseOf(options)}|${id}`;
    const cached = teamNameCache.get(key);
    if (cached && cached.expires > Date.now()) {
      names.set(id, cached.name);
      continue;
    }
    const body = await getJson(options, `${baseOf(options)}/api/v1/teams/${id}`);
    let name: string | null = null;
    if (body !== null) {
      if (!isRecord(body) || !isRecord(body.data) || body.data.team_id !== id) throw invalid(`equipo ${id}`);
      name = optionalText(body.data.name, `equipo ${id}.name`);
    }
    teamNameCache.set(key, { name, expires: Date.now() + TEAM_NAME_TTL_MS });
    names.set(id, name);
  }
  return names;
}

/** Contract matches with the source's team names. */
async function withTeamNames<T extends { match: RawMatch }>(
  options: Options,
  rows: readonly T[],
): Promise<(Omit<T, "match"> & { match: ObservedMatch })[]> {
  const names = await teamNames(options, rows.flatMap((row) => [row.match.homeId, row.match.awayId]));
  const team = (id: number): ObservedTeam => ({ id: teamIdFromSource(id), name: names.get(id) ?? null });
  return rows.map(({ match: { homeId, awayId, ...match }, ...row }) => ({
    ...row,
    match: { ...match, home: team(homeId), away: team(awayId) },
  }));
}

/**
 * `playerObservedMatches` against the local API. `null` for an id that is not
 * one of ours derived from this source, or a player the source does not know;
 * an empty list when it knows the player but has no matches.
 */
export function createLocalApiObservedMatches(options: Options) {
  return async (playerId: string): Promise<ObservedPlayerMatches | null> => {
    const playerSourceId = sourcePlayerId(playerId);
    if (playerSourceId === null) return null;
    const scope = await sourceScope(options);
    const body = await getJson(options, `${baseOf(options)}/api/v1/players/${playerSourceId}/matches`);
    if (body === null) return null;
    if (!isRecord(body) || !Array.isArray(body.data)) throw invalid("se esperaba { data: [] }");
    const rows = body.data.map((row, index) => parseMatchRow(row, index, playerSourceId, scope));
    const matches = await withTeamNames(options, rows.sort(byKickoff(true)));
    return { playerId, matches, scope: MATCHES_SCOPE, ratingSource: RATING_SOURCE, source: PROVENANCE };
  };
}

/**
 * `teamObservedMatches` against the local API: the team's matches by kickoff
 * (undated last). `null` when the team has no explicit correspondence in the
 * source or the source does not know it; an empty list when it has none.
 */
export function createLocalApiTeamMatches(options: Options) {
  return async (teamId: string): Promise<ObservedTeamMatches | null> => {
    const teamSourceId = SOURCE_TEAM_IDS[teamId];
    if (teamSourceId === undefined) return null;
    const scope = await sourceScope(options);
    const body = await getJson(options, `${baseOf(options)}/api/v1/teams/${teamSourceId}/matches`);
    if (body === null) return null;
    if (!isRecord(body) || !Array.isArray(body.data)) throw invalid("se esperaba { data: [] }");
    const rows = body.data.map((row, index) => {
      const at = (field: string) => `data[${index}].${field}`;
      if (!isRecord(row)) throw invalid(`data[${index}]`);
      assertInScope(row, scope, at);
      const match = parseMatch(row, positiveId(row.match_id, at("match_id")), at);
      const side = match.homeId === teamSourceId ? "home" : match.awayId === teamSourceId ? "away" : null;
      if (side === null) throw invalid(`${at("match_id")}: el equipo no juega este partido`);
      return { match, side } as const;
    });
    const matches = await withTeamNames(options, rows.sort(byKickoff(false)));
    const competitions = scope.map(({ name, season }) => ({ name, season }));
    return { teamId, matches, competitions, scope: TEAM_MATCHES_SCOPE, source: PROVENANCE };
  };
}

const SECTION_STATES = new Set(["stored", "empty", "not_stored"]);

/**
 * Team stats from the period `ALL` of a stored `statistics` payload, each
 * from its first item. A missing key or period leaves the value missing.
 */
function parseTeamStats(payload: unknown): { home: TeamMatchStats; away: TeamMatchStats } {
  if (!isRecord(payload) || !Array.isArray(payload.statistics)) throw invalid("statistics");
  const all = payload.statistics.find((period) => isRecord(period) && period.period === "ALL");
  const items = new Map<string, Record<string, unknown>>();
  if (isRecord(all) && Array.isArray(all.groups)) {
    for (const group of all.groups) {
      if (!isRecord(group) || !Array.isArray(group.statisticsItems)) continue;
      for (const item of group.statisticsItems) {
        if (isRecord(item) && typeof item.key === "string" && !items.has(item.key)) items.set(item.key, item);
      }
    }
  }
  const side = (field: "homeValue" | "awayValue") => {
    const stats = {} as TeamMatchStats;
    for (const key of TEAM_STAT_KEYS) {
      const item = items.get(TEAM_STAT_FIELDS[key]);
      const value = item ? optionalNumber(item[field], `statistics.${TEAM_STAT_FIELDS[key]}.${field}`) : null;
      stats[key] = value === null ? NOT_AVAILABLE : { value };
    }
    return stats;
  };
  return { home: side("homeValue"), away: side("awayValue") };
}

/**
 * One side of a stored `lineups` payload, in the source's order. The side is
 * the payload's (`home`/`away`), not each player's `teamId`. The role comes
 * only from the explicit `substitute` flag. Participation follows
 * `participationOf` with the minutes in `statistics` (there is no `played`
 * here): an unused substitute only carries `{ totalShots: 0 }`, so it stays
 * unknown. Formation, colours, captain and stats are left out.
 */
function parseLineupSide(payload: Record<string, unknown>, side: "home" | "away"): ObservedLineupPlayer[] {
  const team = payload[side];
  if (team === undefined || team === null) return [];
  if (!isRecord(team)) throw invalid(`lineups.${side}`);
  const players = team.players ?? [];
  if (!Array.isArray(players)) throw invalid(`lineups.${side}.players`);
  return players.map((entry, index): ObservedLineupPlayer => {
    const at = (field: string) => `lineups.${side}.players[${index}].${field}`;
    if (!isRecord(entry) || !isRecord(entry.player)) throw invalid(at("player"));
    const id = positiveId(entry.player.id, at("player.id"));
    const name = optionalText(entry.player.name, at("player.name"));
    if (name === null) throw invalid(at("player.name"));
    const shirt = optionalNumber(entry.shirtNumber, at("shirtNumber"));
    if (shirt !== null && (!Number.isInteger(shirt) || shirt < 0)) throw invalid(at("shirtNumber"));
    const substitute = entry.substitute ?? null;
    if (substitute !== null && typeof substitute !== "boolean") throw invalid(at("substitute"));
    const statistics = entry.statistics ?? null;
    if (statistics !== null && !isRecord(statistics)) throw invalid(at("statistics"));
    const minutes = statistics ? optionalNumber(statistics.minutesPlayed, at("statistics.minutesPlayed")) : null;
    const confirmed = participationOf(undefined, minutes, `alineación, jugador ${id}`);
    return {
      player: { id: playerIdFromSource(id), name, position: position(entry.position ?? entry.player.position, at("position")) },
      shirtNumber: shirt,
      role: substitute === null ? null : substitute ? "substitute" : "starter",
      participation: confirmed ? "confirmed" : "unknown",
      minutes: confirmed && minutes !== null ? { value: minutes } : NOT_AVAILABLE,
    };
  });
}

/** The source's goal classes; any other stays `unknown`, never an ordinary goal. */
const GOAL_KINDS: Readonly<Record<string, ObservedGoal["kind"]>> = {
  regular: "regular",
  penalty: "penalty",
  ownGoal: "ownGoal",
};

/** A player named in an incident (`{ id, name }`), or `null` when the incident names none. */
function incidentPlayer(value: unknown, field: string): PlayerRef | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw invalid(field);
  const name = optionalText(value.name, `${field}.name`);
  return { id: playerIdFromSource(positiveId(value.id, `${field}.id`)), name: name ?? "Jugador sin nombre", position: null };
}

/**
 * Goals and substitutions of a stored `incidents` payload, as recorded.
 * Other incident types (cards, VAR, periods, missed penalties, a shoot-out)
 * are left out; nothing is recalculated or inferred.
 */
function parseIncidents(payload: unknown): { goals: ObservedGoal[]; substitutions: ObservedSubstitution[] } {
  if (!isRecord(payload) || !Array.isArray(payload.incidents)) throw invalid("incidents");
  const goals: ObservedGoal[] = [];
  const substitutions: ObservedSubstitution[] = [];
  payload.incidents.forEach((incident, index) => {
    const at = (field: string) => `incidents[${index}].${field}`;
    if (!isRecord(incident)) throw invalid(`incidents[${index}]`);
    const when = {
      minute: optionalNumber(incident.time, at("time")),
      addedTime: optionalNumber(incident.addedTime, at("addedTime")),
    };
    if (incident.incidentType === "goal") {
      const kind = optionalText(incident.incidentClass, at("incidentClass"));
      goals.push({
        kind: (kind && GOAL_KINDS[kind]) || "unknown",
        ...when,
        scorer: incidentPlayer(incident.player, at("player")),
        assist: incidentPlayer(incident.assist1, at("assist1")),
      });
    } else if (incident.incidentType === "substitution") {
      substitutions.push({
        ...when,
        playerIn: incidentPlayer(incident.playerIn, at("playerIn")),
        playerOut: incidentPlayer(incident.playerOut, at("playerOut")),
      });
    }
  });
  return { goals, substitutions };
}

function parseLineups(payload: unknown) {
  if (!isRecord(payload)) throw invalid("lineups");
  const confirmed = payload.confirmed ?? null;
  if (confirmed !== null && typeof confirmed !== "boolean") throw invalid("lineups.confirmed");
  return { confirmed, home: parseLineupSide(payload, "home"), away: parseLineupSide(payload, "away") };
}

/**
 * One section of a real match (`statistics`, `lineups`), kept apart from the
 * match: if it cannot be read (the service fails, or answers something
 * unusable) its state is `error` and the rest of the detail is still served.
 */
async function matchSection<T extends object>(
  options: Options,
  sourceId: number,
  section: "statistics" | "lineups" | "incidents",
  parse: (data: unknown) => T,
): Promise<({ state: "stored"; fetchedAt: string | null } & T) | { state: "empty" | "not_stored" | "error"; fetchedAt: string | null }> {
  try {
    const body = await getJson(options, `${baseOf(options)}/api/v1/matches/${sourceId}/${section}`);
    // The match exists, so a 404 here is an inconsistent answer, not a missing section.
    if (body === null) throw invalid(`${section} del partido ${sourceId}: 404`);
    if (!isRecord(body) || !isRecord(body.meta)) throw invalid("se esperaba { data, meta }");
    const state = body.meta.availability;
    if (typeof state !== "string" || !SECTION_STATES.has(state)) throw invalid("meta.availability");
    const fetchedAt = optionalText(body.meta.fetched_at, "meta.fetched_at");
    if (state !== "stored") return { state: state as "empty" | "not_stored", fetchedAt };
    return { state: "stored", fetchedAt, ...parse(body.data) };
  } catch (failure) {
    if (!(failure instanceof UpstreamUnavailableError)) throw failure;
    console.error(`[api] ${section} del partido ${sourceId}:`, failure.message);
    return { state: "error", fetchedAt: null };
  }
}

/**
 * `matchObservedDetail` against the local API: the match with the source's
 * team names, its team stats, line-ups and incidents, one request at a time.
 * `null` for an id not derived from this source (a synthetic id is never
 * read as real) or a match the source does not know.
 */
export function createLocalApiMatchDetail(options: Options) {
  return async (matchId: string): Promise<ObservedMatchDetail | null> => {
    const sourceId = sourceMatchId(matchId);
    if (sourceId === null) return null;
    const scope = await sourceScope(options);
    const body = await getJson(options, `${baseOf(options)}/api/v1/matches/${sourceId}`);
    if (body === null) return null;
    if (!isRecord(body) || !isRecord(body.data)) throw invalid("se esperaba { data: {} }");
    const at = (field: string) => `data.${field}`;
    assertInScope(body.data, scope, at);
    const { homeId, awayId, ...match } = parseMatch(body.data, sourceId, at);
    const statistics = await matchSection(options, sourceId, "statistics", parseTeamStats);
    const lineups = await matchSection(options, sourceId, "lineups", parseLineups);
    const incidents = await matchSection(options, sourceId, "incidents", parseIncidents);
    return {
      match: {
        ...match,
        home: { id: teamIdFromSource(homeId), name: optionalText(body.data.home_team_name, at("home_team_name")) },
        away: { id: teamIdFromSource(awayId), name: optionalText(body.data.away_team_name, at("away_team_name")) },
      },
      statistics,
      lineups,
      incidents,
      scope: MATCH_DETAIL_SCOPE,
      source: PROVENANCE,
    };
  };
}
