export type PlayerOrigin = { kind: "team"; id: string } | { kind: "match"; id: string; tab: "lineups" | "timeline" };
export type PlayerTab = "season" | "matches";

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

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
export type ProfileOrigin = { kind: "team"; id: string } | { kind: "observedMatch"; id: string; tab?: "lineups" };

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

/** The origin of a real profile from its URL; anything not built by `playerProfileHref` is dropped. */
export function profileOrigin(query: { from?: unknown; origin?: unknown; originTab?: unknown }): ProfileOrigin | null {
  if (typeof query.origin !== "string" || !SAFE_ID.test(query.origin)) return null;
  if (query.from === "team") return { kind: "team", id: query.origin };
  if (query.from === "observedMatch") {
    return query.originTab === "lineups" ? { kind: "observedMatch", id: query.origin, tab: "lineups" } : { kind: "observedMatch", id: query.origin };
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

/** Real match detail, always explicitly real (`view=observed`), never the synthetic one. */
export function observedMatchHref(matchId: string, from?: ObservedMatchOrigin | ObservedMatchTeamsOrigin) {
  const query = new URLSearchParams({ view: "observed" });
  if (from && "kind" in from) {
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
    }
  }
  return `/matches/${encodeURIComponent(matchId)}?${query}`;
}

/** The real profile to return to from a real match, with that match selected, or null for the match list. */
export function observedMatchReturnHref(matchId: string, query: {
  from?: unknown; player?: unknown; season?: unknown; playerFrom?: unknown; playerOrigin?: unknown; playerOriginTab?: unknown;
}) {
  if (query.from !== "player" || typeof query.player !== "string" || !SAFE_ID.test(query.player)) return null;
  const seasonId = typeof query.season === "string" && SAFE_ID.test(query.season) ? query.season : null;
  return playerProfileHref(query.player, seasonId,
    profileOrigin({ from: query.playerFrom, origin: query.playerOrigin, originTab: query.playerOriginTab }),
    SAFE_ID.test(matchId) ? matchId : null);
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

export function playerReturnHref(seasonId: string | null, query: { from?: string; origin?: string; originTab?: string }) {
  const validId = query.origin && SAFE_ID.test(query.origin);
  // A real match keeps its explicit real view on return, never the synthetic detail.
  if (query.from === "observedMatch" && validId) {
    return `/matches/${encodeURIComponent(query.origin!)}?view=observed${query.originTab === "lineups" ? "&tab=lineups" : ""}`;
  }
  if (query.from === "match" && validId) {
    const tab = query.originTab === "lineups" || query.originTab === "timeline" ? `?tab=${query.originTab}` : "";
    return `/matches/${encodeURIComponent(query.origin!)}${tab}`;
  }
  return teamsHref({ seasonId, teamId: query.from === "team" && validId ? query.origin! : null, tab: "players" });
}
