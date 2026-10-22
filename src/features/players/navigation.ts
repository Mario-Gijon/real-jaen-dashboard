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
 */
export function playerProfileHref(playerId: string, seasonId: string | null, origin: ProfileOrigin | null) {
  const query = new URLSearchParams({ view: "profile" });
  if (seasonId) query.set("season", seasonId);
  if (origin) {
    query.set("from", origin.kind);
    query.set("origin", origin.id);
    if (origin.kind === "observedMatch" && origin.tab) query.set("originTab", origin.tab);
  }
  return `/players/${encodeURIComponent(playerId)}?${query}`;
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

/** Real match detail, always explicitly real (`view=observed`), never the synthetic one. */
export function observedMatchHref(matchId: string, from?: ObservedMatchOrigin) {
  const query = new URLSearchParams({ view: "observed" });
  if (from) {
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

/** The real profile to return to from a real match, or null for the match list. */
export function observedMatchReturnHref(query: {
  from?: unknown; player?: unknown; season?: unknown; playerFrom?: unknown; playerOrigin?: unknown; playerOriginTab?: unknown;
}) {
  if (query.from !== "player" || typeof query.player !== "string" || !SAFE_ID.test(query.player)) return null;
  const seasonId = typeof query.season === "string" && SAFE_ID.test(query.season) ? query.season : null;
  return playerProfileHref(query.player, seasonId,
    profileOrigin({ from: query.playerFrom, origin: query.playerOrigin, originTab: query.playerOriginTab }));
}

/** Initial player tab and match from the URL; unknown values fall back to Temporada without a match. */
export function playerInitialView(query: { tab?: string | string[]; match?: string | string[] }): { tab: PlayerTab; matchId: string | null } {
  if (query.tab !== "matches") return { tab: "season", matchId: null };
  return { tab: "matches", matchId: typeof query.match === "string" && query.match ? query.match : null };
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
  const teamQuery = new URLSearchParams();
  if (seasonId) teamQuery.set("season", seasonId);
  if (query.from === "team" && validId) teamQuery.set("team", query.origin!);
  teamQuery.set("tab", "players");
  return `/teams?${teamQuery}`;
}
