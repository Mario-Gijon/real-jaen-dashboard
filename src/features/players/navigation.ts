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
export function playerProfileHref(playerId: string, seasonId: string | null, origin: ProfileOrigin) {
  const query = new URLSearchParams({ view: "profile" });
  if (seasonId) query.set("season", seasonId);
  query.set("from", origin.kind);
  query.set("origin", origin.id);
  if (origin.kind === "observedMatch" && origin.tab) query.set("originTab", origin.tab);
  return `/players/${encodeURIComponent(playerId)}?${query}`;
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
