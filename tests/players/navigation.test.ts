import { describe, expect, it } from "vitest";
import { playerHref, playerReturnHref } from "@/features/players/navigation";

describe("Player navigation context", () => {
  it("returns to the same team, season and players tab without browser history", () => {
    const href = playerHref("player-1", "season-2", { kind: "team", id: "team-3" });
    const query = Object.fromEntries(new URL(href, "http://localhost").searchParams);
    expect(href).toBe("/players/player-1?season=season-2&from=team&origin=team-3");
    expect(playerReturnHref(query.season, query)).toBe("/teams?season=season-2&team=team-3&tab=players");
  });
  it.each(["lineups", "timeline"] as const)("returns to the origin match and %s tab", tab => {
    const href = playerHref("player-1", "season-2", { kind: "match", id: "match-3", tab });
    const query = Object.fromEntries(new URL(href, "http://localhost").searchParams);
    expect(playerReturnHref(query.season, query)).toBe(`/matches/match-3?tab=${tab}`);
  });
  it.each([{}, { from: "unknown", origin: "match-1" }, { from: "match", origin: "https://example.com" },
    { from: "team", origin: "//example.com" }, { from: "match", origin: "../teams" }])("uses a deterministic internal fallback for %j", query => {
    expect(playerReturnHref("season-2", query)).toBe("/teams?season=season-2&tab=players");
  });
});
