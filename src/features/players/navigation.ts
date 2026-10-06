export type PlayerOrigin = { kind: "team"; id: string } | { kind: "match"; id: string; tab: "lineups" | "timeline" };

export function playerHref(playerId: string, seasonId: string, origin?: PlayerOrigin) {
  const query = new URLSearchParams({ season: seasonId });
  if (origin) {
    query.set("from", origin.kind);
    query.set("origin", origin.id);
    if (origin.kind === "match") query.set("tab", origin.tab);
  }
  return `/players/${encodeURIComponent(playerId)}?${query}`;
}

export function playerReturnHref(seasonId: string | null, query: { from?: string; origin?: string; tab?: string }) {
  const validId = query.origin && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(query.origin);
  if (query.from === "match" && validId) {
    const tab = query.tab === "lineups" || query.tab === "timeline" ? `?tab=${query.tab}` : "";
    return `/matches/${encodeURIComponent(query.origin!)}${tab}`;
  }
  const teamQuery = new URLSearchParams();
  if (seasonId) teamQuery.set("season", seasonId);
  if (query.from === "team" && validId) teamQuery.set("team", query.origin!);
  teamQuery.set("tab", "players");
  return `/teams?${teamQuery}`;
}
