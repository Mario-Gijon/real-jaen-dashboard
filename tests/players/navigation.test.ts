import { describe, expect, it } from "vitest";
import { playerHref, playerInitialView, playerProfileHref, playerReturnHref } from "@/features/players/navigation";

function queryOf(href: string) {
  return Object.fromEntries(new URL(href, "http://localhost").searchParams);
}

describe("Player navigation context", () => {
  it("returns to the same team, season and players tab without browser history", () => {
    const href = playerHref("player-1", "season-2", { kind: "team", id: "team-3" });
    const query = queryOf(href);
    expect(href).toBe("/players/player-1?season=season-2&from=team&origin=team-3");
    expect(playerInitialView(query)).toEqual({ tab: "season", matchId: null });
    expect(playerReturnHref(query.season, query)).toBe("/teams?season=season-2&team=team-3&tab=players");
  });
  it.each(["lineups", "timeline"] as const)("opens Partidos on the origin match from %s and returns to that tab", tab => {
    const href = playerHref("player-1", "season-2", { kind: "match", id: "match-3", tab });
    const query = queryOf(href);
    expect(href).toBe(`/players/player-1?season=season-2&tab=matches&match=match-3&from=match&origin=match-3&originTab=${tab}`);
    expect(playerInitialView(query)).toEqual({ tab: "matches", matchId: "match-3" });
    expect(playerReturnHref(query.season, query)).toBe(`/matches/match-3?tab=${tab}`);
  });
  it("opens Temporada for direct access without parameters", () => {
    expect(playerHref("player-1", "season-2")).toBe("/players/player-1?season=season-2");
    expect(playerInitialView({})).toEqual({ tab: "season", matchId: null });
  });
  it.each([
    [{ tab: "unknown", match: "match-3" }, { tab: "season", matchId: null }],
    [{ tab: "lineups" }, { tab: "season", matchId: null }],
    [{ match: "match-3" }, { tab: "season", matchId: null }],
    [{ tab: ["matches", "season"] }, { tab: "season", matchId: null }],
    [{ tab: "matches" }, { tab: "matches", matchId: null }],
    [{ tab: "matches", match: "" }, { tab: "matches", matchId: null }],
    [{ tab: "matches", match: ["a", "b"] }, { tab: "matches", matchId: null }],
    [{ tab: "matches", match: "unknown-match" }, { tab: "matches", matchId: "unknown-match" }],
  ])("resolves the initial view deterministically for %j", (query, expected) => {
    expect(playerInitialView(query)).toEqual(expected);
  });
  it("returns to the origin match without a section when the origin tab is unknown", () => {
    expect(playerReturnHref("season-2", { from: "match", origin: "match-3", originTab: "summary" })).toBe("/matches/match-3");
  });
  it.each([{}, { from: "unknown", origin: "match-1" }, { from: "match", origin: "https://example.com" },
    { from: "team", origin: "//example.com" }, { from: "match", origin: "../teams" },
    { from: "match", origin: "https://example.com", originTab: "lineups" }])("uses a deterministic internal fallback for %j", query => {
    expect(playerReturnHref("season-2", query)).toBe("/teams?season=season-2&tab=players");
  });

  it("opens a real profile without tying it to the season, which only restores the return", () => {
    const href = playerProfileHref("sofascore-player-7", "season-2", { kind: "team", id: "team-3" });
    expect(href).toBe("/players/sofascore-player-7?view=profile&season=season-2&from=team&origin=team-3");
    const query = queryOf(href);
    expect(playerReturnHref(query.season, query)).toBe("/teams?season=season-2&team=team-3&tab=players");
    expect(playerProfileHref("p", null, { kind: "team", id: "t" })).toBe("/players/p?view=profile&from=team&origin=t");
  });
});
