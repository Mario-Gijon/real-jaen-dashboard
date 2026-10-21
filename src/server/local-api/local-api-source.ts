import type {
  ObservedPlayers,
  PlayerPosition,
  PlayerProfile,
  PlayerRef,
  PreferredFoot,
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

const PROFILE_SCOPE =
  "Datos personales según la fuente. No indican equipo actual, temporada ni estadísticas.";

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
