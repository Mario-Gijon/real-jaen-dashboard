import type { ObservedPlayers, PlayerPosition, PlayerRef } from "@/contract";

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

/**
 * Public player id derived from the provider's id. Stable while this provider
 * is used, but NOT an identity independent of it: another source would need
 * an explicit correspondence.
 */
export const playerIdFromSource = (sourceId: number) => `sofascore-player-${sourceId}`;

/** Source position letters; anything else is unknown, never guessed. */
const POSITIONS: Readonly<Record<string, PlayerPosition>> = {
  G: "goalkeeper",
  D: "defender",
  M: "midfielder",
  F: "forward",
};

const PROVENANCE = { synthetic: false, label: "Datos reales" } as const;

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

/** Checks the whole body before using any of it: a malformed row fails the request. */
function parsePlayers(body: unknown): { players: PlayerRef[]; scope: string } {
  const invalid = (detail: string) => new UpstreamUnavailableError(`Respuesta no válida: ${detail}`);
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(body.meta)) {
    throw invalid("se esperaba { data: [], meta: {} }");
  }
  const { scope, count } = body.meta;
  if (typeof scope !== "string" || !scope.trim()) throw invalid("meta.scope ausente");

  const seen = new Set<number>();
  const players = body.data.map((row, index): PlayerRef => {
    if (!isRecord(row)) throw invalid(`data[${index}] no es un objeto`);
    const { player_id: id, name, usual_position: position } = row;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      throw invalid(`data[${index}].player_id`);
    }
    if (seen.has(id)) throw invalid(`player_id ${id} repetido`);
    seen.add(id);
    if (typeof name !== "string" || !name.trim()) throw invalid(`data[${index}].name`);
    if (position !== undefined && position !== null && typeof position !== "string") {
      throw invalid(`data[${index}].usual_position`);
    }
    return {
      id: playerIdFromSource(id),
      name: name.trim(),
      position: (typeof position === "string" && POSITIONS[position]) || null,
    };
  });
  if (count !== undefined && count !== players.length) {
    console.warn(`API local: meta.count (${String(count)}) ≠ ${players.length} jugadores recibidos.`);
  }
  return { players, scope: scope.trim() };
}

/**
 * `observedPlayers` against the local API. `null` when the team has no
 * correspondence in the source or the source does not know it.
 */
export function createLocalApiObservedPlayers({
  baseUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetch: fetchImpl = fetch,
}: Options) {
  const base = baseUrl.replace(/\/+$/, "");
  return async (teamId: string): Promise<ObservedPlayers | null> => {
    const sourceId = SOURCE_TEAM_IDS[teamId];
    if (sourceId === undefined) return null;
    const url = `${base}/api/v1/teams/${sourceId}/players`;

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

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new UpstreamUnavailableError(`Respuesta no JSON en ${url}`, { cause });
    }
    return { teamId, ...parsePlayers(body), source: PROVENANCE };
  };
}
