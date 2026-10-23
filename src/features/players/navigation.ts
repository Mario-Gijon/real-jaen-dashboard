import { CLUB_ID } from "../club";

export type PlayerOrigin = { kind: "team"; id: string } | { kind: "match"; id: string; tab: "lineups" | "timeline" };
export type PlayerTab = "season" | "matches";

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/** The status filter of «Partidos». */
export type MatchesState = "all" | "finished" | "pending";
const matchesState = (value: unknown): MatchesState => (value === "finished" || value === "pending" ? value : "all");

/**
 * «Partidos» on a team (`all`: every team) and status filter: what the page
 * keeps in its URL and what links back to it build. The club and «Todos»
 * are the defaults and are left out.
 */
export function matchesHref({ teamId = null, state = "all" }: { teamId?: string | null; state?: MatchesState }) {
  const query = new URLSearchParams();
  if (teamId && teamId !== CLUB_ID) query.set("team", teamId);
  if (state !== "all") query.set("state", state);
  return query.size ? `/matches?${query}` : "/matches";
}

/** The status filter a «Partidos» URL asks for; anything else is «Todos». */
export function matchesInitialState(query: { state?: unknown }): MatchesState {
  return matchesState(query.state);
}

/** «Partidos» on the team and status a real match was opened from, as its URL had them (`matchesHref`). */
export type ObservedMatchListOrigin = { kind: "matches"; teamId: string | null; state: MatchesState };

/** A player reached from a match opens its Partidos tab on that match; any other origin opens Temporada. */
export function playerHref(playerId: string, seasonId: string, origin?: PlayerOrigin) {
  const query = new URLSearchParams({ season: seasonId });
  if (origin?.kind === "match") {
    query.set("tab", "matches");
    query.set("match", origin.id);
  }
  if (origin) {
    query.set("from", origin.kind);
    query.set("origin", origin.id);
    if (origin.kind === "match") query.set("originTab", origin.tab);
  }
  return `/players/${encodeURIComponent(playerId)}?${query}`;
}

/** Where a real profile was opened from: a team's observed players or a real match's line-ups. */
export type ProfileOrigin = { kind: "team"; id: string } | { kind: "observedMatch"; id: string; tab?: "lineups"; matches?: ObservedMatchListOrigin };

/**
 * Season-less personal profile of a player from a real source. `season` only
 * restores the team view on return; the profile itself does not depend on it.
 * `matchId` selects one of the player's real matches.
 */
export function playerProfileHref(playerId: string, seasonId: string | null, origin: ProfileOrigin | null, matchId: string | null = null) {
  const query = new URLSearchParams({ view: "profile" });
  if (seasonId) query.set("season", seasonId);
  if (origin) {
    query.set("from", origin.kind);
    query.set("origin", origin.id);
    if (origin.kind === "observedMatch" && origin.tab) query.set("originTab", origin.tab);
    if (origin.kind === "observedMatch" && origin.matches) setProfileMatches(query, origin.matches);
  }
  if (matchId) query.set("match", matchId);
  return `/players/${encodeURIComponent(playerId)}?${query}`;
}

/**
 * Real match selected in a real profile: the one in the URL, else the real
 * match whose line-ups opened the profile, else none (the profile picks).
 */
export function profileInitialMatch(query: { match?: unknown; from?: unknown; origin?: unknown }): string | null {
  if (typeof query.match === "string" && SAFE_ID.test(query.match)) return query.match;
  if (query.from === "observedMatch" && typeof query.origin === "string" && SAFE_ID.test(query.origin)) return query.origin;
  return null;
}

type ProfileMatchesQuery = { matchFrom?: unknown; matchTeam?: unknown; matchState?: unknown };

function setProfileMatches(query: URLSearchParams, origin: ObservedMatchListOrigin) {
  query.set("matchFrom", "matches");
  if (origin.teamId && origin.teamId !== CLUB_ID) query.set("matchTeam", origin.teamId);
  if (origin.state !== "all") query.set("matchState", origin.state);
}

/** The origin of a real profile from its URL; anything not built by `playerProfileHref` is dropped. */
export function profileOrigin(query: { from?: unknown; origin?: unknown; originTab?: unknown } & ProfileMatchesQuery): ProfileOrigin | null {
  if (typeof query.origin !== "string" || !SAFE_ID.test(query.origin)) return null;
  if (query.from === "team") return { kind: "team", id: query.origin };
  if (query.from === "observedMatch") {
    const origin: ProfileOrigin = { kind: "observedMatch", id: query.origin };
    if (query.originTab === "lineups") origin.tab = "lineups";
    if (query.matchFrom === "matches") origin.matches = { kind: "matches",
      teamId: typeof query.matchTeam === "string" && SAFE_ID.test(query.matchTeam) ? query.matchTeam : null,
      state: matchesState(query.matchState) };
    return origin;
  }
  return null;
}

/**
 * A real profile a real match was opened from, with that profile's own
 * origin so it can still return there. One level only: a profile opened from
 * this match's line-ups returns to the match, never further back.
 */
export type ObservedMatchOrigin = { playerId: string; seasonId: string | null; origin: ProfileOrigin | null };

/** «Equipos» on the team, season and tab a real match was opened from, as its URL had them (`teamsHref`). */
export type ObservedMatchTeamsOrigin = { kind: "teams"; seasonId: string | null; teamId: string | null; tab: "performance" | "players" };

/** «Inicio» on the season and target match a match was opened from (`homeHref`); a real Inicio has no season. */
export type HomeOrigin = { kind: "home"; seasonId: string | null; matchId: string };

/** «Inicio» on a season and target match: what the page keeps in its URL and what links back to it build. */
export function homeHref({ seasonId = null, matchId = null }: { seasonId?: string | null; matchId?: string | null }) {
  const query = new URLSearchParams();
  if (seasonId) query.set("season", seasonId);
  if (matchId) query.set("match", matchId);
  return query.size ? `/?${query}` : "/";
}

/** The «Inicio» to return to from a match opened there, or null when it was opened elsewhere. */
export function homeReturnHref(query: { from?: unknown; season?: unknown; match?: unknown }) {
  if (query.from !== "home") return null;
  const id = (value: unknown) => (typeof value === "string" && SAFE_ID.test(value) ? value : null);
  return homeHref({ seasonId: id(query.season), matchId: id(query.match) });
}

/** Synthetic match detail; opened from «Inicio», it returns there. */
export function matchHref(matchId: string, from?: HomeOrigin) {
  const query = new URLSearchParams();
  if (from) setHomeOrigin(query, from);
  return query.size ? `/matches/${encodeURIComponent(matchId)}?${query}` : `/matches/${encodeURIComponent(matchId)}`;
}

function setHomeOrigin(query: URLSearchParams, from: HomeOrigin) {
  query.set("from", "home");
  if (from.seasonId) query.set("season", from.seasonId);
  query.set("match", from.matchId);
}

/** Real match detail, always explicitly real (`view=observed`), never the synthetic one. */
export function observedMatchHref(matchId: string, from?: ObservedMatchOrigin | ObservedMatchTeamsOrigin | HomeOrigin | ObservedMatchListOrigin) {
  const query = new URLSearchParams({ view: "observed" });
  if (from && "kind" in from && from.kind === "home") {
    setHomeOrigin(query, from);
  } else if (from && "kind" in from && from.kind === "matches") {
    query.set("from", "matches");
    if (from.teamId && from.teamId !== CLUB_ID) query.set("team", from.teamId);
    if (from.state !== "all") query.set("state", from.state);
  } else if (from && "kind" in from) {
    query.set("from", "teams");
    if (from.seasonId) query.set("season", from.seasonId);
    if (from.teamId) query.set("team", from.teamId);
    if (from.tab === "players") query.set("tab", "players");
  } else if (from) {
    query.set("from", "player");
    query.set("player", from.playerId);
    if (from.seasonId) query.set("season", from.seasonId);
    if (from.origin) {
      query.set("playerFrom", from.origin.kind);
      query.set("playerOrigin", from.origin.id);
      if (from.origin.kind === "observedMatch" && from.origin.tab) query.set("playerOriginTab", from.origin.tab);
      if (from.origin.kind === "observedMatch" && from.origin.matches) setProfileMatches(query, from.origin.matches);
    }
  }
  return `/matches/${encodeURIComponent(matchId)}?${query}`;
}

/** The real profile to return to from a real match, with that match selected, or null for the match list. */
export function observedMatchReturnHref(matchId: string, query: {
  from?: unknown; player?: unknown; season?: unknown; playerFrom?: unknown; playerOrigin?: unknown; playerOriginTab?: unknown;
} & ProfileMatchesQuery) {
  if (query.from !== "player" || typeof query.player !== "string" || !SAFE_ID.test(query.player)) return null;
  const seasonId = typeof query.season === "string" && SAFE_ID.test(query.season) ? query.season : null;
  return playerProfileHref(query.player, seasonId,
    profileOrigin({ ...query, from: query.playerFrom, origin: query.playerOrigin, originTab: query.playerOriginTab }),
    SAFE_ID.test(matchId) ? matchId : null);
}

/**
 * Another real match opened from this one (e.g. the event that replaces it),
 * keeping the origin this one was opened from, so «Volver» still leads there.
 */
export function relatedObservedMatchHref(matchId: string, query: Record<string, unknown>) {
  const id = (value: unknown) => (typeof value === "string" && SAFE_ID.test(value) ? value : null);
  const homeMatch = query.from === "home" ? id(query.match) : null;
  if (homeMatch) return observedMatchHref(matchId, { kind: "home", seasonId: id(query.season), matchId: homeMatch });
  if (query.from === "matches") return observedMatchHref(matchId, { kind: "matches", teamId: id(query.team), state: matchesState(query.state) });
  if (query.from === "teams") {
    return observedMatchHref(matchId, { kind: "teams", seasonId: id(query.season), teamId: id(query.team),
      tab: query.tab === "players" ? "players" : "performance" });
  }
  const player = query.from === "player" ? id(query.player) : null;
  if (player) {
    return observedMatchHref(matchId, { playerId: player, seasonId: id(query.season),
      origin: profileOrigin({ ...query, from: query.playerFrom, origin: query.playerOrigin, originTab: query.playerOriginTab }) });
  }
  return observedMatchHref(matchId);
}

/**
 * «Partidos» on the team and status a real match was opened from, or null
 * when it was opened elsewhere (the match page then returns to plain
 * «Partidos»: the club, all statuses).
 */
export function observedMatchListReturnHref(query: { from?: unknown; team?: unknown; state?: unknown }) {
  if (query.from !== "matches") return null;
  const teamId = typeof query.team === "string" && SAFE_ID.test(query.team) ? query.team : null;
  return matchesHref({ teamId, state: matchesState(query.state) });
}

/** The «Equipos» view to return to from a real match opened there, or null when it was opened elsewhere. */
export function observedMatchTeamsReturnHref(query: { from?: unknown; season?: unknown; team?: unknown; tab?: unknown }) {
  if (query.from !== "teams") return null;
  const id = (value: unknown) => (typeof value === "string" && SAFE_ID.test(value) ? value : null);
  return teamsHref({ seasonId: id(query.season), teamId: id(query.team), tab: query.tab === "players" ? "players" : "performance" });
}

/** Initial player tab and match from the URL; unknown values fall back to Temporada without a match. */
export function playerInitialView(query: { tab?: string | string[]; match?: string | string[] }): { tab: PlayerTab; matchId: string | null } {
  if (query.tab !== "matches") return { tab: "season", matchId: null };
  return { tab: "matches", matchId: typeof query.match === "string" && query.match ? query.match : null };
}

/**
 * «Equipos» on a team, season and tab: what the page keeps in its URL and what
 * links back to it build. The default tab (Rendimiento) is left out.
 */
export function teamsHref({ seasonId = null, teamId = null, tab = "performance" }: {
  seasonId?: string | null; teamId?: string | null; tab?: "performance" | "players";
}) {
  const query = new URLSearchParams();
  if (seasonId) query.set("season", seasonId);
  if (teamId) query.set("team", teamId);
  if (tab === "players") query.set("tab", "players");
  return query.size ? `/teams?${query}` : "/teams";
}

/** The team, season and tab a «Equipos» URL asks for (`teamsHref` writes them); anything else is left unset. */
export function teamsInitialView(query: { team?: unknown; season?: unknown; tab?: unknown }) {
  const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
  return {
    initialTeamId: text(query.team),
    initialSeasonId: text(query.season),
    initialTab: query.tab === "players" ? "players" as const : "performance" as const,
  };
}

export function playerReturnHref(seasonId: string | null, query: { from?: string; origin?: string; originTab?: string } & ProfileMatchesQuery) {
  const validId = query.origin && SAFE_ID.test(query.origin);
  // A real match keeps its explicit real view on return, never the synthetic detail.
  if (query.from === "observedMatch" && validId) {
    const origin = profileOrigin(query);
    const href = observedMatchHref(query.origin!, origin?.kind === "observedMatch" ? origin.matches : undefined);
    return `${href}${query.originTab === "lineups" ? "&tab=lineups" : ""}`;
  }
  if (query.from === "match" && validId) {
    const tab = query.originTab === "lineups" || query.originTab === "timeline" ? `?tab=${query.originTab}` : "";
    return `/matches/${encodeURIComponent(query.origin!)}${tab}`;
  }
  return teamsHref({ seasonId, teamId: query.from === "team" && validId ? query.origin! : null, tab: "players" });
}
