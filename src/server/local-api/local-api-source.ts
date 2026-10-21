import {
  OBSERVED_MATCH_STAT_KEYS,
  type MatchStatus,
  type ObservedMatchStatKey,
  type ObservedPlayerMatch,
  type ObservedPlayerMatches,
  type ObservedPlayers,
  type ObservedTeam,
  type PlayerPosition,
  type PlayerProfile,
  type PlayerRef,
  type PreferredFoot,
  type Stat,
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

const matchIdFromSource = (sourceId: number) => `sofascore-match-${sourceId}`;

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
  xg: "expectedGoals",
  passesCompleted: "accuratePass",
  passes: "totalPass",
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

type RawObservedMatch = Omit<ObservedPlayerMatch, "match"> & {
  match: Omit<ObservedPlayerMatch["match"], "home" | "away"> & { homeId: number; awayId: number };
};

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
function parseMatchRow(row: unknown, index: number, playerSourceId: number): RawObservedMatch {
  const at = (field: string) => `data[${index}].${field}`;
  if (!isRecord(row) || !isRecord(row.match)) throw invalid(`data[${index}]`);
  if (row.player_id !== playerSourceId) throw invalid(at("player_id"));
  const match = row.match;
  const id = positiveId(row.match_id, at("match_id"));
  if (match.match_id !== undefined && match.match_id !== id) throw invalid(at("match.match_id"));
  if (row.side !== "home" && row.side !== "away") throw invalid(at("side"));
  for (const flag of ["substitute", "played"] as const) {
    const value = row[flag];
    if (value !== undefined && value !== null && typeof value !== "boolean") throw invalid(at(flag));
  }
  const statistics = row.statistics ?? null;
  if (statistics !== null && !isRecord(statistics)) throw invalid(at("statistics"));

  const kickoff = optionalText(match.kickoff_utc, at("match.kickoff_utc"));
  if (kickoff !== null && Number.isNaN(Date.parse(kickoff))) throw invalid(at("match.kickoff_utc"));
  const status = optionalText(match.status, at("match.status"));
  const known = (status && STATUSES[status]) || null;
  const round = optionalNumber(match.round, at("match.round"));
  const homeScore = optionalNumber(match.home_score, at("match.home_score"));
  const awayScore = optionalNumber(match.away_score, at("match.away_score"));

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
    match: {
      id: matchIdFromSource(id),
      kickoff,
      status: known,
      competition: optionalText(match.competition, at("match.competition")),
      season: optionalText(match.season, at("match.season")),
      round: round !== null && Number.isInteger(round) ? round : null,
      homeId: positiveId(match.home_team_id, at("match.home_team_id")),
      awayId: positiveId(match.away_team_id, at("match.away_team_id")),
      score:
        known === "finished" && homeScore !== null && awayScore !== null
          ? { home: homeScore, away: awayScore }
          : null,
    },
    side: row.side,
    role: row.substitute === true ? "substitute" : row.substitute === false ? "starter" : null,
    participation: confirmed ? "confirmed" : "unknown",
    stats,
  };
}

/** Newest first; matches without a date go last. */
function byKickoffDesc(a: RawObservedMatch, b: RawObservedMatch): number {
  if (a.match.kickoff === b.match.kickoff) return a.match.id.localeCompare(b.match.id);
  if (a.match.kickoff === null) return 1;
  if (b.match.kickoff === null) return -1;
  return Date.parse(b.match.kickoff) - Date.parse(a.match.kickoff);
}

/**
 * Team names as the source gives them (`GET /api/v1/teams/{id}`). A team the
 * source does not know keeps `name: null`; never a name from elsewhere. One
 * request at a time: the local service refused connections (ECONNREFUSED)
 * with about ten at once. The cause is still to be investigated (the service
 * already uses ThreadingHTTPServer); see README.
 */
async function teamNames(options: Options, ids: readonly number[]): Promise<Map<number, string | null>> {
  const names = new Map<number, string | null>();
  for (const id of new Set(ids)) {
    const body = await getJson(options, `${baseOf(options)}/api/v1/teams/${id}`);
    if (body === null) {
      names.set(id, null);
      continue;
    }
    if (!isRecord(body) || !isRecord(body.data) || body.data.team_id !== id) throw invalid(`equipo ${id}`);
    names.set(id, optionalText(body.data.name, `equipo ${id}.name`));
  }
  return names;
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
    const body = await getJson(options, `${baseOf(options)}/api/v1/players/${playerSourceId}/matches`);
    if (body === null) return null;
    if (!isRecord(body) || !Array.isArray(body.data)) throw invalid("se esperaba { data: [] }");
    const rows = body.data.map((row, index) => parseMatchRow(row, index, playerSourceId));
    const names = await teamNames(options, rows.flatMap((row) => [row.match.homeId, row.match.awayId]));
    const team = (id: number): ObservedTeam => ({ id: teamIdFromSource(id), name: names.get(id) ?? null });
    const matches = rows.sort(byKickoffDesc).map(({ match: { homeId, awayId, ...match }, ...row }) => ({
      ...row,
      match: { ...match, home: team(homeId), away: team(awayId) },
    }));
    return { playerId, matches, scope: MATCHES_SCOPE, ratingSource: RATING_SOURCE, source: PROVENANCE };
  };
}
