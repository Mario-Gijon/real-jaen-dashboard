import type {
  ApiError,
  Competition,
  MatchDetail,
  MatchFilter,
  MatchSummary,
  ObservedPlayerMatches,
  ObservedPlayers,
  ObservedTeamMatches,
  PlayerProfile,
  PlayerSeason,
  SourceInfo,
  TeamSeason,
  TeamStanding,
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

/** The only way screens read data: a typed GET against `/api/v1`. */
async function get<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    signal: options?.signal,
    headers: { Accept: "application/json" },
  });
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

/** A team's matches as a real source lists them, by kickoff. */
export function getTeamObservedMatches(teamId: string, options?: RequestOptions) {
  return get<ObservedTeamMatches>(`/teams/${segment(teamId)}/observed-matches`, options);
}

/** Matches in which a real source lists the player, newest first. */
export function getPlayerObservedMatches(playerId: string, options?: RequestOptions) {
  return get<ObservedPlayerMatches>(`/players/${segment(playerId)}/observed-matches`, options);
}

/** A real player's personal data, in no season; `source` says where they come from. */
export function getPlayerProfile(playerId: string, options?: RequestOptions) {
  return get<PlayerProfile>(`/players/${segment(playerId)}/profile`, options);
}
