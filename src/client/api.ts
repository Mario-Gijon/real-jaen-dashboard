import type {
  AccessSession,
  ApiError,
  Competition,
  MatchDetail,
  MatchFilter,
  MatchComments,
  MatchSummary,
  ObservedMatchDetail,
  ObservedPlayerMatches,
  ObservedPlayers,
  ObservedSquad,
  ObservedTeamMatches,
  ObservedTeamPerformance,
  PlayerProfile,
  PlayerSeason,
  SourceInfo,
  TeamSeason,
  TeamStanding,
  ObservedTeam,
  UpdateJob,
  UpdateStart,
  UpdateStatus,
} from "@/contract";

/** A failed `/api/v1` request, with the contract's error code when present. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Options of every call; `signal` cancels it (e.g. when a screen unmounts). */
export type RequestOptions = { signal?: AbortSignal };

/**
 * A session that expired or was revoked while a screen was open: back to the access page, returning here after.
 * The access page itself never redirects to itself.
 */
function signInAgain(response: Response) {
  if (response.status !== 401 || typeof window === "undefined" || window.location.pathname === "/acceso") return;
  const here = `${window.location.pathname}${window.location.search}`;
  window.location.assign(here === "/" ? "/acceso" : `/acceso?next=${encodeURIComponent(here)}`);
}

/** The only way screens read data: a typed GET against `/api/v1`. */
async function get<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    signal: options?.signal,
    headers: { Accept: "application/json" },
  });
  signInAgain(response);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      response.status,
      body?.error.code ?? "HTTP_ERROR",
      body?.error.message ?? `Error ${response.status} en /api/v1${path}`,
    );
  }
  return (await response.json()) as T;
}

/**
 * A state change (POST/DELETE): same origin with the session cookie, never cached. The internal secrets stay on
 * the server; the browser only ever holds the HttpOnly session.
 */
async function send<T>(method: "POST" | "DELETE", path: string, init: { body?: unknown; headers?: Record<string, string> } = {}): Promise<T | null> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json", ...(init.body === undefined ? {} : { "Content-Type": "application/json" }), ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (path !== "/session") signInAgain(response);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      response.status,
      body?.error.code ?? "HTTP_ERROR",
      body?.error.message ?? `Error ${response.status} en /api/v1${path}`,
    );
  }
  return response.status === 204 ? null : ((await response.json()) as T);
}

const segment = encodeURIComponent;

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** Whether the data are synthetic. */
export function getSource(options?: RequestOptions) {
  return get<SourceInfo>("/source", options);
}

export function getCompetitions(options?: RequestOptions) {
  return get<Competition[]>("/competitions", options);
}

export function getSeasonMatches(
  seasonId: string,
  filter: MatchFilter = {},
  options?: RequestOptions,
) {
  return get<MatchSummary[]>(
    `/seasons/${segment(seasonId)}/matches${query({ round: filter.round, team: filter.teamId })}`,
    options,
  );
}

export function getMatch(matchId: string, options?: RequestOptions) {
  return get<MatchDetail>(`/matches/${segment(matchId)}`, options);
}

export function getSeasonTeams(seasonId: string, options?: RequestOptions) {
  return get<TeamStanding[]>(`/seasons/${segment(seasonId)}/teams`, options);
}

export function getTeamSeason(seasonId: string, teamId: string, options?: RequestOptions) {
  return get<TeamSeason>(`/seasons/${segment(seasonId)}/teams/${segment(teamId)}`, options);
}

export function getPlayer(playerId: string, seasonId: string, options?: RequestOptions) {
  return get<PlayerSeason>(`/players/${segment(playerId)}${query({ season: seasonId })}`, options);
}

/** Players seen with a team, in no season; `source` says where they come from. */
export function getObservedPlayers(teamId: string, options?: RequestOptions) {
  return get<ObservedPlayers>(`/teams/${segment(teamId)}/players`, options);
}

/** A real team's public identity, including when it has no own statistics export. */
export function getObservedTeam(teamId: string, options?: RequestOptions) {
  return get<ObservedTeam>(`/teams/${segment(teamId)}`, options);
}

/** A team's observed players with their figures per competition of the real source's scope. */
export function getObservedSquad(teamId: string, options?: RequestOptions) {
  return get<ObservedSquad>(`/teams/${segment(teamId)}/observed-squad`, options);
}

/** A real match with its team stats (`id` from a real match list). */
export function getObservedMatchDetail(matchId: string, options?: RequestOptions) {
  return get<ObservedMatchDetail>(`/matches/${segment(matchId)}/observed`, options);
}

/** Narrative comments of a match, without treating them as incidents or sports statistics. */
export function getMatchComments(matchId: string, options?: RequestOptions) {
  return get<MatchComments>(`/matches/${segment(matchId)}/comments`, options);
}

/** A team's matches as a real source lists them, by kickoff. */
export function getTeamObservedMatches(teamId: string, options?: RequestOptions) {
  return get<ObservedTeamMatches>(`/teams/${segment(teamId)}/observed-matches`, options);
}

/** A team's results in each competition of the real source's scope. */
export function getTeamObservedPerformance(teamId: string, options?: RequestOptions) {
  return get<ObservedTeamPerformance>(`/teams/${segment(teamId)}/observed-performance`, options);
}

/** Matches in which a real source lists the player, newest first. */
export function getPlayerObservedMatches(playerId: string, options?: RequestOptions) {
  return get<ObservedPlayerMatches>(`/players/${segment(playerId)}/observed-matches`, options);
}

/** A real player's personal data, in no season; `source` says where they come from. */
export function getPlayerProfile(playerId: string, options?: RequestOptions) {
  return get<PlayerProfile>(`/players/${segment(playerId)}/profile`, options);
}

/** Whether updates exist, their real scope, the last publication and the active and last jobs. */
export function getUpdateStatus(options?: RequestOptions) {
  return get<UpdateStatus>("/updates/current", options);
}

/** Progress or result of one update. */
export function getUpdate(id: string, options?: RequestOptions) {
  return get<UpdateJob>(`/updates/${segment(id)}`, options);
}

/** Starts the update; the same key always answers the same job, so a repeated click never starts another. */
export async function startUpdate(idempotencyKey: string) {
  return (await send<UpdateStart>("POST", "/updates", { headers: { "Idempotency-Key": idempotencyKey } }))!;
}

export async function cancelUpdate(id: string) {
  return (await send<UpdateJob>("POST", `/updates/${segment(id)}/cancel`))!;
}

/** Whether this installation asks for the password and whether this browser has a session. */
export function getSession(options?: RequestOptions) {
  return get<AccessSession>("/session", options);
}

/** Opens a 90-day session with the shared password; the browser keeps only the HttpOnly cookie. */
export async function signIn(password: string) {
  await send<null>("POST", "/session", { body: { password } });
}

export async function signOut() {
  await send<null>("DELETE", "/session");
}
