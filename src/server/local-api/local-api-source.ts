import {
  OBSERVED_MATCH_STAT_KEYS,
  OBSERVED_SQUAD_STATS,
  TEAM_STAT_KEYS,
  type LocalReplacement,
  type MatchStatus,
  type ObservedMatch,
  type ObservedGoal,
  type ObservedLineupPlayer,
  type ObservedMatchDetail,
  type ObservedMatchStatKey,
  type ObservedPlayerMatch,
  type ObservedPlayerMatches,
  type ObservedPlayers,
  type ObservedSquad,
  type ObservedSquadCompetition,
  type ObservedSquadPlayer,
  type ObservedSquadStat,
  type ObservedSubstitution,
  type MatchResult,
  type ObservedCompetition,
  type ObservedCompetitionPerformance,
  type ObservedTeam,
  type ObservedTeamMatches,
  type ObservedTeamOutput,
  type ObservedTeamPerformance,
  type SeasonStat,
  type TeamOutputIndicator,
  TEAM_OUTPUT_INDICATORS,
  type PlayerPosition,
  type PlayerProfile,
  type PlayerRef,
  type PreferredFoot,
  type Side,
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
 * A team other than the club keeps the id the match lists already derive for
 * it (`sofascore-team-{id}`), so its links do not change. Having an entry is
 * not enough to analyse a team: the source must also declare an export of
 * its own (see `analysableSourceTeam`).
 */
const SOURCE_TEAM_IDS: Readonly<Record<string, number>> = {
  "team-real-jaen": 2841,
  // Primera Federación, Group 2, 26/27: ids checked against the scraper's catalog (tournament 94191, season 97382).
  "sofascore-team-24368": 24368, // UD Ibiza
  "sofascore-team-24322": 24322, // AD Alcorcón
  "sofascore-team-4489": 4489, // Algeciras CF
  "sofascore-team-24323": 24323, // Antequera
  "sofascore-team-24326": 24326, // Atlético Madrileño
  "sofascore-team-43751": 43751, // CD Teruel
  "sofascore-team-217210": 217210, // CDA Águilas FC
  "sofascore-team-135672": 135672, // CE Europa
  "sofascore-team-24329": 24329, // FC Cartagena
  "sofascore-team-2840": 2840, // Gimnàstic de Tarragona
  "sofascore-team-2877": 2877, // Hércules CF
  "sofascore-team-24265": 24265, // Huesca
  "sofascore-team-263407": 263407, // Juventud Torremolinos CF
  "sofascore-team-202074": 202074, // Rayo Majadahonda
  "sofascore-team-5069": 5069, // Real Madrid Castilla U21
  "sofascore-team-4487": 4487, // Real Murcia
  "sofascore-team-2815": 2815, // Real Zaragoza
  "sofascore-team-24363": 24363, // UE Sant Andreu
  "sofascore-team-24338": 24338, // Villarreal B U23
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
    const sourceId = await analysableSourceTeam(options, teamId);
    if (sourceId === null) return null;
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
  return (await sourceDeclaration(options)).competitions;
}

/**
 * The scope and the teams with an export of their own declared by the
 * importer's manifest (`teams_with_own_export`). An export of its own does
 * not prove a full calendar; a service that declares none (an older one, or
 * data imported without a manifest) has no team to analyse.
 */
async function sourceDeclaration(options: Options): Promise<{ competitions: SourceCompetition[]; ownExport: Set<number> }> {
  const body = await getJson(options, `${baseOf(options)}/api/v1/scope`);
  if (body === null) throw new UpstreamUnavailableError("La API local no declara su ámbito (/api/v1/scope).");
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.competitions) || !body.data.competitions.length) {
    throw invalid("se esperaba { data: { competitions: [...] } }");
  }
  const declared = body.data.teams_with_own_export ?? [];
  if (!Array.isArray(declared)) throw invalid("data.teams_with_own_export");
  const ownExport = new Set(declared.map((entry, index) => {
    if (!isRecord(entry)) throw invalid(`data.teams_with_own_export[${index}]`);
    return positiveId(entry.team_id, `data.teams_with_own_export[${index}].team_id`);
  }));
  return { competitions: parseCompetitions(body.data.competitions), ownExport };
}

/**
 * The source id of a team that can be analysed: explicit correspondence and
 * an export of its own declared by the source. `null` otherwise, so a rival
 * seen only in other teams' matches never passes for an analysed team.
 */
async function analysableSourceTeam(options: Options, teamId: string): Promise<number | null> {
  const sourceId = SOURCE_TEAM_IDS[teamId];
  if (sourceId === undefined) return null;
  return (await sourceDeclaration(options)).ownExport.has(sourceId) ? sourceId : null;
}

function parseCompetitions(competitions: unknown[]): SourceCompetition[] {
  return competitions.map((entry, index) => {
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

/** The service's participation of a call-up. */
const PARTICIPATIONS: Readonly<Record<string, ObservedPlayerMatch["participation"]>> = {
  played: "confirmed",
  unused: "unused",
  unknown: "unknown",
};
const NORMALIZED_SOURCES = new Set(["reported", "omitted_zero", "unused"]);

/** A call-up as the service normalizes it: participation, and minutes, goals and assists with their origin. */
type NormalizedCallUp = { participation: ObservedPlayerMatch["participation"]; minutes: Stat; goals: Stat; assists: Stat };

/** One normalized figure, `{ value, source }`: a non-negative integer with its origin, or missing with none. */
function normalizedFigure(value: unknown, field: string): Stat {
  if (!isRecord(value)) throw invalid(field);
  if (value.value === null) {
    if (value.source !== null) throw invalid(`${field}.source`);
    return NOT_AVAILABLE;
  }
  if (typeof value.source !== "string" || !NORMALIZED_SOURCES.has(value.source)) throw invalid(`${field}.source`);
  return { value: count(value.value, `${field}.value`) };
}

/**
 * The service's normalization of one call-up (`normalized`): the source's
 * rules live there, once, for figures, profile and line-ups. This only checks
 * it holds: an unused substitute has 0 of everything, an unknown call-up
 * nothing.
 */
function parseNormalized(value: unknown, field: string): NormalizedCallUp {
  if (!isRecord(value)) throw invalid(`${field}: falta la normalización del servicio`);
  const participation = typeof value.participation === "string" ? PARTICIPATIONS[value.participation] : undefined;
  if (!participation) throw invalid(`${field}.participation`);
  const [minutes, goals, assists] = (["minutes", "goals", "assists"] as const).map((key) => normalizedFigure(value[key], `${field}.${key}`));
  const figures = [minutes, goals, assists].map((stat) => stat.value);
  if (participation === "unused" && figures.some((figure) => figure !== 0)) throw invalid(`${field}: un no utilizado suma 0`);
  if (participation === "unknown" && figures.some((figure) => figure !== null)) throw invalid(`${field}: sin participación no hay cifras`);
  return { participation, minutes, goals, assists };
}

/**
 * One call-up row, with the service's normalization: participation, minutes,
 * goals and assists come from it (an unused substitute has 0 of each). Every
 * other stat is the source's own, only for a confirmed appearance; omitted,
 * it stays missing, never 0.
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

  const normalized = parseNormalized(row.normalized, at("normalized"));
  const confirmed = normalized.participation === "confirmed";
  const stats = {} as Record<ObservedMatchStatKey, Stat>;
  for (const key of OBSERVED_MATCH_STAT_KEYS) {
    if (key === "minutes" || key === "goals" || key === "assists") {
      stats[key] = normalized[key];
      continue;
    }
    const value = statistics ? optionalNumber(statistics[STAT_FIELDS[key]], at(`statistics.${STAT_FIELDS[key]}`)) : null;
    stats[key] = confirmed && value !== null ? { value } : NOT_AVAILABLE;
  }

  return {
    match,
    side: row.side,
    role: row.substitute === true ? "substitute" : row.substitute === false ? "starter" : null,
    position: position(row.match_position, at("match_position")),
    participation: normalized.participation,
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

const TEAM_PERFORMANCE_SCOPE =
  "Resultados, producción y concesión de los partidos finalizados observados en esta competición (estadísticas del partido completo). No es necesariamente la temporada completa: sin clasificación ni puntos.";

/** A count or score of the source's aggregate: a non-negative integer (never a boolean nor a decimal). */
function count(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw invalid(field);
  return value;
}

const RESULT_KEYS: Readonly<Record<MatchResult, "wins" | "draws" | "losses">> = { win: "wins", draw: "draws", loss: "losses" };
const resultOf = (goalsFor: number, goalsAgainst: number): MatchResult =>
  goalsFor > goalsAgainst ? "win" : goalsFor === goalsAgainst ? "draw" : "loss";

/** Highest valid per-match average of each indicator: a percentage for possession, unbounded otherwise. */
const OUTPUT_LIMIT: Partial<Record<TeamOutputIndicator, number>> = { possession: 100 };

/** One average of the service: `{ value, matches, of }` as a {@link SeasonStat}; absent when no match has it. */
function parseAverage(value: unknown, indicator: TeamOutputIndicator, field: string): SeasonStat {
  if (!isRecord(value)) throw invalid(field);
  const matches = count(value.matches, `${field}.matches`);
  const of = count(value.of, `${field}.of`);
  if (matches > of) throw invalid(`${field}.matches`);
  if (matches === 0) {
    if (value.value !== null) throw invalid(`${field}.value: sin partidos con dato no hay media`);
    return { value: null, coverage: "none", reason: "not_available", matches: 0, of };
  }
  const average = value.value;
  if (typeof average !== "number" || !Number.isFinite(average) || average < 0 || average > (OUTPUT_LIMIT[indicator] ?? Infinity)) {
    throw invalid(`${field}.value`);
  }
  return { value: average, coverage: matches === of ? "complete" : "partial", matches, of };
}

function parseAverages(value: unknown, of: number, field: string): Record<TeamOutputIndicator, SeasonStat> {
  if (!isRecord(value)) throw invalid(field);
  const averages = {} as Record<TeamOutputIndicator, SeasonStat>;
  for (const indicator of TEAM_OUTPUT_INDICATORS) {
    averages[indicator] = parseAverage(value[indicator], indicator, `${field}.${indicator}`);
    if (averages[indicator].of !== of) throw invalid(`${field}.${indicator}.of`);
  }
  return averages;
}

const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-9;

/**
 * Production and concession of the service over the counted matches. It
 * checks what can be checked against the results: averages over every
 * counted match (season) or over «Últimos 3», which must be the three most
 * recent dated results; goals must match the scores.
 */
function parseOutput(value: unknown, results: readonly { match: { id: string; kickoff: string | null }; goalsFor: number; goalsAgainst: number }[], field: string): ObservedTeamOutput {
  if (!isRecord(value) || !isRecord(value.last3) || !Array.isArray(value.last3.match_ids)) throw invalid(field);
  const season = parseAverages(value.season, results.length, `${field}.season`);
  const dated = results.filter((row) => row.match.kickoff !== null);
  const expected = dated.slice(-3);
  const matchIds = value.last3.match_ids.map((id, i) => matchIdFromSource(positiveId(id, `${field}.last3.match_ids[${i}]`)));
  if (matchIds.join() !== expected.map((row) => row.match.id).join()) throw invalid(`${field}.last3.match_ids: no son los tres más recientes`);
  const last3 = parseAverages(value.last3.values, expected.length, `${field}.last3.values`);
  if (count(value.undated, `${field}.undated`) !== results.length - dated.length) throw invalid(`${field}.undated`);
  const checkGoals = (rows: readonly { goalsFor: number; goalsAgainst: number }[], averages: Record<TeamOutputIndicator, SeasonStat>) => {
    if (!rows.length) return;
    const goals = rows.reduce((sum, row) => sum + row.goalsFor, 0) / rows.length;
    const against = rows.reduce((sum, row) => sum + row.goalsAgainst, 0) / rows.length;
    if (!near(averages.goals.value, goals) || !near(averages.goalsAgainst.value, against)) throw invalid(`${field}: goles que no coinciden con los marcadores`);
  };
  checkGoals(results, season);
  checkGoals(expected, last3);
  return { season, last3: { matchIds, values: last3 }, undated: value.undated as number };
}

/**
 * One competition of the source's aggregate. The service computes it; this
 * only checks it is in the declared scope and consistent (states add up, the
 * record matches its results and venues, each result matches its score and
 * side) before adapting it. Anything else makes the whole answer invalid.
 */
async function parseCompetitionPerformance(
  options: Options, entry: unknown, index: number, teamSourceId: number, scope: readonly SourceCompetition[],
): Promise<ObservedCompetitionPerformance> {
  const at = (field: string) => `data.competitions[${index}].${field}`;
  if (!isRecord(entry) || !isRecord(entry.matches) || !isRecord(entry.record) || !isRecord(entry.venues) || !Array.isArray(entry.results)) {
    throw invalid(`data.competitions[${index}]`);
  }
  const competition = scope.find((c) => c.tournamentId === entry.tournament_id && c.seasonId === entry.season_id);
  if (!competition) throw invalid(`${at("tournament_id")}: competición fuera del ámbito declarado`);
  const m = entry.matches;
  const matches = {
    inScope: count(m.in_scope, at("matches.in_scope")), finished: count(m.finished, at("matches.finished")),
    pending: count(m.pending, at("matches.pending")), counted: count(m.counted, at("matches.counted")),
    finishedWithoutValidScore: count(m.finished_without_valid_score, at("matches.finished_without_valid_score")),
    excludedByVersionConflict: count(m.excluded_by_version_conflict, at("matches.excluded_by_version_conflict")),
    unknownStatus: count(m.unknown_status, at("matches.unknown_status")),
    // A source without local replacements may not send it: none.
    replacedLocally: m.replaced_locally === undefined ? 0 : count(m.replaced_locally, at("matches.replaced_locally")),
  };
  const r = entry.record;
  const record = {
    played: count(r.played, at("record.played")), wins: count(r.wins, at("record.wins")), draws: count(r.draws, at("record.draws")),
    losses: count(r.losses, at("record.losses")), goalsFor: count(r.goals_for, at("record.goals_for")),
    goalsAgainst: count(r.goals_against, at("record.goals_against")), goalDifference: 0,
  };
  if (r.goal_difference !== record.goalsFor - record.goalsAgainst) throw invalid(at("record.goal_difference"));
  record.goalDifference = record.goalsFor - record.goalsAgainst;
  const venues = {} as ObservedCompetitionPerformance["venues"];
  for (const side of ["home", "away"] as const) {
    const v = entry.venues[side];
    if (!isRecord(v)) throw invalid(at(`venues.${side}`));
    venues[side] = { win: count(v.wins, at(`venues.${side}.wins`)), draw: count(v.draws, at(`venues.${side}.draws`)),
      loss: count(v.losses, at(`venues.${side}.losses`)) };
  }

  const rows = entry.results.map((row, i) => {
    const rat = (field: string) => at(`results[${i}].${field}`);
    if (!isRecord(row) || !isRecord(row.match)) throw invalid(rat("match"));
    if (row.match.tournament_id !== competition.tournamentId || row.match.season_id !== competition.seasonId) {
      throw invalid(`${rat("match.tournament_id")}: partido de otra competición`);
    }
    const match = parseMatch(row.match, positiveId(row.match.match_id, rat("match.match_id")), (field) => rat(`match.${field}`));
    if (match.status !== "finished" || match.score === null) throw invalid(`${rat("match")}: no es un finalizado con marcador`);
    if (row.side !== "home" && row.side !== "away") throw invalid(rat("side"));
    const side: Side = row.side;
    if ((side === "home" ? match.homeId : match.awayId) !== teamSourceId) throw invalid(rat("side"));
    const goalsFor = count(row.goals_for, rat("goals_for"));
    const goalsAgainst = count(row.goals_against, rat("goals_against"));
    const [own, other] = side === "home" ? [match.score.home, match.score.away] : [match.score.away, match.score.home];
    if (own !== goalsFor || other !== goalsAgainst) throw invalid(`${rat("goals_for")}: no coincide con el marcador`);
    const result = resultOf(goalsFor, goalsAgainst);
    if (row.result !== result) throw invalid(rat("result"));
    return { match, side, result, goalsFor, goalsAgainst };
  });

  const tally = { win: 0, draw: 0, loss: 0 };
  const byVenue = { home: { win: 0, draw: 0, loss: 0 }, away: { win: 0, draw: 0, loss: 0 } };
  for (const row of rows) {
    tally[row.result]++;
    byVenue[row.side][row.result]++;
  }
  const consistent =
    matches.inScope === matches.finished + matches.pending + matches.unknownStatus
    && matches.counted === matches.finished - matches.finishedWithoutValidScore - matches.excludedByVersionConflict
    && record.played === matches.counted && rows.length === record.played
    && (["win", "draw", "loss"] as const).every((k) => tally[k] === record[RESULT_KEYS[k]]
      && byVenue.home[k] === venues.home[k] && byVenue.away[k] === venues.away[k])
    && rows.reduce((sum, row) => sum + row.goalsFor, 0) === record.goalsFor
    && rows.reduce((sum, row) => sum + row.goalsAgainst, 0) === record.goalsAgainst;
  if (!consistent) throw invalid(`${at("record")}: los totales no coinciden con los partidos`);

  // A failure of the metrics alone keeps the record: the figures are left out, never replaced.
  let output: ObservedTeamOutput | null = null;
  try {
    output = parseOutput(entry.output, rows.map((row) => ({ ...row, match: { id: row.match.id, kickoff: row.match.kickoff } })), at("output"));
  } catch (error) {
    if (!(error instanceof UpstreamUnavailableError)) throw error;
    console.error(`API local: ${error.message}; se muestran resultados sin producción ni concesión.`);
  }
  return {
    id: `sofascore-scope-${competition.tournamentId}-${competition.seasonId}`,
    name: competition.name,
    season: competition.season,
    matches,
    record,
    venues,
    results: await withTeamNames(options, rows),
    output,
  };
}

/**
 * `teamObservedPerformance` against the local API: the team's results in each
 * competition of the declared scope, as the service aggregates them, plus the
 * teams that can be analysed (those with explicit correspondence). `null` for
 * a team without correspondence or one the source does not know.
 */
export function createLocalApiTeamPerformance(options: Options) {
  return async (teamId: string): Promise<ObservedTeamPerformance | null> => {
    const teamSourceId = SOURCE_TEAM_IDS[teamId];
    if (teamSourceId === undefined) return null;
    const { competitions: scope, ownExport } = await sourceDeclaration(options);
    if (!ownExport.has(teamSourceId)) return null;
    const body = await getJson(options, `${baseOf(options)}/api/v1/teams/${teamSourceId}/performance`);
    if (body === null) return null;
    if (!isRecord(body) || !isRecord(body.data) || body.data.team_id !== teamSourceId || !Array.isArray(body.data.competitions)) {
      throw invalid("se esperaba { data: { team_id, competitions: [] } }");
    }
    const competitions: ObservedCompetitionPerformance[] = [];
    // One at a time: the local service refuses concurrent connections.
    for (const [index, entry] of body.data.competitions.entries()) {
      competitions.push(await parseCompetitionPerformance(options, entry, index, teamSourceId, scope));
    }
    // The teams that can be analysed: explicit correspondence and an export of their own.
    const analysable = Object.entries(SOURCE_TEAM_IDS).filter(([, sourceId]) => ownExport.has(sourceId));
    const names = await teamNames(options, analysable.map(([, sourceId]) => sourceId));
    const teams = analysable.map(([id, sourceId]) => ({ id, name: names.get(sourceId) ?? null }));
    return { teamId, competitions, teams, scope: TEAM_PERFORMANCE_SCOPE, source: PROVENANCE };
  };
}

const OBSERVED_SQUAD_SCOPE =
  "Jugadores observados en las convocatorias de los partidos finalizados disponibles de esta competición. No garantiza toda la temporada ni es una plantilla completa o necesariamente actual.";

/** The service's name for each accumulated figure. */
const SQUAD_STAT_FIELDS: Readonly<Record<ObservedSquadStat, string>> = {
  appearances: "appearances",
  starts: "starts",
  minutes: "minutes",
  goals: "goals",
  assists: "assists",
};

/**
 * One accumulated figure of the service, `{ value, matches, of }`, over the
 * player's call-ups: a sum of non-negative integers, absent when no call-up
 * has it. `appearances` counts the call-ups in which the player took part
 * (`value`) out of those whose participation is known (`matches`: played or
 * unused), so 0 is a value whenever any is known.
 */
function parseSquadStat(value: unknown, stat: ObservedSquadStat, callUps: number, field: string): SeasonStat {
  if (!isRecord(value)) throw invalid(field);
  const matches = count(value.matches, `${field}.matches`);
  if (count(value.of, `${field}.of`) !== callUps) throw invalid(`${field}.of: no son las convocatorias del jugador`);
  if (matches > callUps) throw invalid(`${field}.matches`);
  if (matches === 0) {
    if (value.value !== null) throw invalid(`${field}.value: sin convocatorias con dato no hay cifra`);
    return { value: null, coverage: "none", reason: "not_available", matches: 0, of: callUps };
  }
  const total = count(value.value, `${field}.value`);
  if ((stat === "starts" || stat === "appearances") && total > matches) throw invalid(`${field}.value`);
  return { value: total, coverage: matches === callUps ? "complete" : "partial", matches, of: callUps };
}

function parseSquadPlayer(row: unknown, field: string, withCallUps: number): ObservedSquadPlayer {
  if (!isRecord(row)) throw invalid(field);
  const id = positiveId(row.player_id, `${field}.player_id`);
  const name = optionalText(row.name, `${field}.name`);
  if (name === null) throw invalid(`${field}.name`);
  const height = row.height_cm ?? null;
  if (height !== null && !(typeof height === "number" && Number.isInteger(height) && height > 0)) throw invalid(`${field}.height_cm`);
  const foot = optionalText(row.preferred_foot, `${field}.preferred_foot`);
  const shirt = row.last_shirt_number ?? null;
  const callUps = count(row.call_ups, `${field}.call_ups`);
  if (callUps === 0 || callUps > withCallUps) throw invalid(`${field}.call_ups`);
  const stats = {} as Record<ObservedSquadStat, SeasonStat>;
  for (const stat of OBSERVED_SQUAD_STATS) {
    stats[stat] = parseSquadStat(row[SQUAD_STAT_FIELDS[stat]], stat, callUps, `${field}.${SQUAD_STAT_FIELDS[stat]}`);
  }
  return {
    player: { id: playerIdFromSource(id), name, position: position(row.usual_position, `${field}.usual_position`) },
    heightCm: height,
    preferredFoot: (foot && FEET[foot.toLowerCase()]) || null,
    lastShirtNumber: shirt === null ? null : count(shirt, `${field}.last_shirt_number`),
    callUps,
    stats,
  };
}

/**
 * One competition of the service's player aggregate. The service computes
 * it; this checks it is in the declared scope and adds up (each figure over
 * the player's call-ups, players once each, call-ups and confirmed
 * participations matching their totals). Anything else makes the whole
 * answer invalid: no figure is shown from a response that does not hold.
 */
function parseSquadCompetition(entry: unknown, index: number, scope: readonly SourceCompetition[]): ObservedSquadCompetition {
  const at = (field: string) => `data.competitions[${index}].${field}`;
  if (!isRecord(entry) || !isRecord(entry.matches) || !isRecord(entry.call_ups) || !Array.isArray(entry.players)) {
    throw invalid(`data.competitions[${index}]`);
  }
  const competition = scope.find((c) => c.tournamentId === entry.tournament_id && c.seasonId === entry.season_id);
  if (!competition) throw invalid(`${at("tournament_id")}: competición fuera del ámbito declarado`);
  const matches = { counted: count(entry.matches.counted, at("matches.counted")),
    withCallUps: count(entry.matches.with_call_ups, at("matches.with_call_ups")) };
  if (matches.withCallUps > matches.counted) throw invalid(at("matches.with_call_ups"));
  const c = entry.call_ups;
  const callUps = {
    total: count(c.total, at("call_ups.total")), played: count(c.played, at("call_ups.played")),
    unused: count(c.unused, at("call_ups.unused")), unknown: count(c.unknown, at("call_ups.unknown")),
    contradictions: count(c.contradictions, at("call_ups.contradictions")),
    mismatches: count(c.mismatches, at("call_ups.mismatches")),
    teamWarnings: count(c.team_warnings, at("call_ups.team_warnings")),
    duplicateRecords: count(c.duplicate_records, at("call_ups.duplicate_records")),
    discardedRecords: count(c.discarded_records, at("call_ups.discarded_records")),
  };
  const seen = new Set<string>();
  const players = entry.players.map((row, i) => {
    const player = parseSquadPlayer(row, at(`players[${i}]`), matches.withCallUps);
    if (seen.has(player.player.id)) throw invalid(`${at(`players[${i}].player_id`)} repetido`);
    seen.add(player.player.id);
    return player;
  });
  const sum = (of: (p: ObservedSquadPlayer) => number) => players.reduce((total, p) => total + of(p), 0);
  if (sum((p) => p.callUps) !== callUps.total || callUps.played + callUps.unused + callUps.unknown !== callUps.total
    || sum((p) => p.stats.appearances.value ?? 0) !== callUps.played
    || sum((p) => p.stats.appearances.matches) !== callUps.played + callUps.unused
    || callUps.contradictions > callUps.unknown) {
    throw invalid(`${at("call_ups")}: los totales no coinciden con los jugadores`);
  }
  return {
    id: `sofascore-scope-${competition.tournamentId}-${competition.seasonId}`,
    name: competition.name,
    season: competition.season,
    matches,
    callUps,
    players,
  };
}

/**
 * `observedSquad` against the local API: the team's observed players with
 * their figures in each competition of the declared scope, as the service
 * accumulates them, personal data included (one request, never one per
 * player). `null` for a team without correspondence or one the source does
 * not know.
 */
export function createLocalApiObservedSquad(options: Options) {
  return async (teamId: string): Promise<ObservedSquad | null> => {
    const teamSourceId = SOURCE_TEAM_IDS[teamId];
    if (teamSourceId === undefined) return null;
    const { competitions: scope, ownExport } = await sourceDeclaration(options);
    if (!ownExport.has(teamSourceId)) return null;
    const body = await getJson(options, `${baseOf(options)}/api/v1/teams/${teamSourceId}/player-stats`);
    if (body === null) return null;
    if (!isRecord(body) || !isRecord(body.data) || body.data.team_id !== teamSourceId || !Array.isArray(body.data.competitions)) {
      throw invalid("se esperaba { data: { team_id, competitions: [] } }");
    }
    const competitions = body.data.competitions.map((entry, index) => parseSquadCompetition(entry, index, scope));
    return { teamId, competitions, scope: OBSERVED_SQUAD_SCOPE, source: PROVENANCE };
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
 * only from the explicit `substitute` flag. Participation and minutes are the
 * service's normalization of each call-up (`normalized`, as in the figures and
 * the profile); a player it does not cover stays unknown. Formation, colours,
 * captain and stats are left out.
 */
function parseLineupSide(
  payload: Record<string, unknown>, side: "home" | "away", normalized: ReadonlyMap<number, NormalizedCallUp>,
): ObservedLineupPlayer[] {
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
    const callUp = normalized.get(id);
    return {
      player: { id: playerIdFromSource(id), name, position: position(entry.position ?? entry.player.position, at("position")) },
      shirtNumber: shirt,
      role: substitute === null ? null : substitute ? "substitute" : "starter",
      participation: callUp?.participation ?? "unknown",
      minutes: callUp?.minutes ?? NOT_AVAILABLE,
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

/** The service's normalized call-ups of a match (`normalized.players`), by the provider's player id. */
function parseNormalizedPlayers(value: unknown): Map<number, NormalizedCallUp> {
  if (!isRecord(value) || !Array.isArray(value.players)) throw invalid("normalized: falta la normalización del servicio");
  const players = new Map<number, NormalizedCallUp>();
  value.players.forEach((entry, index) => {
    const field = `normalized.players[${index}]`;
    if (!isRecord(entry)) throw invalid(field);
    const id = positiveId(entry.player_id, `${field}.player_id`);
    if (players.has(id)) throw invalid(`${field}.player_id repetido`);
    players.set(id, parseNormalized(entry, field));
  });
  return players;
}

function parseLineups(payload: unknown, body: Record<string, unknown>) {
  if (!isRecord(payload)) throw invalid("lineups");
  const confirmed = payload.confirmed ?? null;
  if (confirmed !== null && typeof confirmed !== "boolean") throw invalid("lineups.confirmed");
  const normalized = parseNormalizedPlayers(body.normalized);
  return { confirmed, home: parseLineupSide(payload, "home", normalized), away: parseLineupSide(payload, "away", normalized) };
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
  parse: (data: unknown, body: Record<string, unknown>) => T,
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
    return { state: "stored", fetchedAt, ...parse(body.data, body) };
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
/** One local decision on a match (`decision: "local"`): the other event, the reason and who decided it, when. */
function parseReplacementEntry(value: unknown, field: string): LocalReplacement {
  if (!isRecord(value) || value.decision !== "local") throw invalid(field);
  const text = (key: string) => {
    const found = optionalText(value[key], `${field}.${key}`);
    if (found === null) throw invalid(`${field}.${key}`);
    return found;
  };
  const decidedOn = text("decided_on");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(decidedOn)) throw invalid(`${field}.decided_on`);
  return { matchId: matchIdFromSource(positiveId(value.match_id, `${field}.match_id`)), reason: text("reason"),
    decidedBy: text("decided_by"), decidedOn };
}

/** The local replacement of a match (`replaced_by`, `replaces`), or `undefined` when no local decision concerns it. */
function parseLocalReplacement(data: Record<string, unknown>, at: (field: string) => string): ObservedMatchDetail["localReplacement"] {
  if (data.replaced_by === undefined && data.replaces === undefined) return undefined;
  if (data.replaces !== undefined && !Array.isArray(data.replaces)) throw invalid(at("replaces"));
  const replacedBy = data.replaced_by === undefined ? null : parseReplacementEntry(data.replaced_by, at("replaced_by"));
  const replaces = (data.replaces ?? []).map((entry, i) => parseReplacementEntry(entry, at(`replaces[${i}]`)));
  if (replacedBy !== null && replaces.length) throw invalid(`${at("replaced_by")}: un evento sustituido no sustituye a otro`);
  return { replacedBy, replaces };
}

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
    const localReplacement = parseLocalReplacement(body.data, at);
    return {
      match: {
        ...match,
        home: { id: teamIdFromSource(homeId), name: optionalText(body.data.home_team_name, at("home_team_name")) },
        away: { id: teamIdFromSource(awayId), name: optionalText(body.data.away_team_name, at("away_team_name")) },
      },
      ...(localReplacement ? { localReplacement } : {}),
      statistics,
      lineups,
      incidents,
      scope: MATCH_DETAIL_SCOPE,
      source: PROVENANCE,
    };
  };
}
