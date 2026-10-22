import { describe, expect, it } from "vitest";
import {
  observedMatchHref, observedMatchReturnHref, playerHref, playerInitialView, playerProfileHref, playerReturnHref, profileOrigin,
} from "@/features/players/navigation";

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

  it("returns from a real profile opened in a real match to that real match, never the synthetic detail", () => {
    const href = playerProfileHref("sofascore-player-7", null, { kind: "observedMatch", id: "sofascore-match-3" });
    expect(href).toBe("/players/sofascore-player-7?view=profile&from=observedMatch&origin=sofascore-match-3");
    expect(playerReturnHref(null, queryOf(href))).toBe("/matches/sofascore-match-3?view=observed");
  });

  it("returns to the line-ups tab of a real match when the profile was opened there", () => {
    const href = playerProfileHref("sofascore-player-7", null, { kind: "observedMatch", id: "sofascore-match-3", tab: "lineups" });
    expect(href).toBe("/players/sofascore-player-7?view=profile&from=observedMatch&origin=sofascore-match-3&originTab=lineups");
    expect(playerReturnHref(null, queryOf(href))).toBe("/matches/sofascore-match-3?view=observed&tab=lineups");
  });

  it("opens a real match from the list without any return context", () => {
    expect(observedMatchHref("sofascore-match-3")).toBe("/matches/sofascore-match-3?view=observed");
    expect(observedMatchReturnHref(queryOf(observedMatchHref("sofascore-match-3")))).toBeNull();
  });

  it.each([
    ["a team", "/players/sofascore-player-7?view=profile&season=season-2&from=team&origin=team-3"],
    ["a real match's line-ups", "/players/sofascore-player-7?view=profile&from=observedMatch&origin=sofascore-match-1&originTab=lineups"],
    ["a real match", "/players/sofascore-player-7?view=profile&from=observedMatch&origin=sofascore-match-1"],
    ["nowhere", "/players/sofascore-player-7?view=profile"],
  ])("returns from a real match to the profile opened from %s, which keeps its own return", (_, profile) => {
    const query = queryOf(profile);
    const seasonId = query.season ?? null;
    const href = observedMatchHref("sofascore-match-9", { playerId: "sofascore-player-7", seasonId, origin: profileOrigin(query) });
    expect(href.startsWith("/matches/sofascore-match-9?view=observed&from=player&player=sofascore-player-7")).toBe(true);
    const back = observedMatchReturnHref(queryOf(href));
    expect(back).toBe(profile);
    expect(playerReturnHref(seasonId, queryOf(back!))).toBe(playerReturnHref(seasonId, query));
  });

  it("does not grow when going back and forth between a profile and its matches", () => {
    let profile = playerProfileHref("sofascore-player-7", "season-2", { kind: "observedMatch", id: "sofascore-match-1", tab: "lineups" });
    const first = profile;
    for (let i = 0; i < 5; i++) {
      const query = queryOf(profile);
      const match = observedMatchHref("sofascore-match-1", { playerId: "sofascore-player-7", seasonId: query.season, origin: profileOrigin(query) });
      // A profile opened from that match's line-ups returns to the match only.
      const lineupProfile = playerProfileHref("sofascore-player-8", null, { kind: "observedMatch", id: "sofascore-match-1", tab: "lineups" });
      expect(playerReturnHref(null, queryOf(lineupProfile))).toBe("/matches/sofascore-match-1?view=observed&tab=lineups");
      profile = observedMatchReturnHref(queryOf(match))!;
    }
    expect(profile).toBe(first);
  });

  it.each([
    {},
    { from: "team", player: "sofascore-player-7" },
    { from: "player" },
    { from: "player", player: "" },
    { from: "player", player: "https://example.com" },
    { from: "player", player: "//example.com" },
    { from: "player", player: "../teams" },
    { from: "player", player: ["sofascore-player-7", "sofascore-player-8"] },
    { from: ["player", "player"], player: "sofascore-player-7" },
  ])("returns from a real match to the match list for %j", query => {
    expect(observedMatchReturnHref(query)).toBeNull();
  });

  it.each([
    [{ playerFrom: "team", playerOrigin: "//example.com" }, "/players/sofascore-player-7?view=profile"],
    [{ playerFrom: "match", playerOrigin: "match-3" }, "/players/sofascore-player-7?view=profile"],
    [{ playerFrom: "observedMatch", playerOrigin: "sofascore-match-1", playerOriginTab: "timeline" },
      "/players/sofascore-player-7?view=profile&from=observedMatch&origin=sofascore-match-1"],
    [{ season: "../x", playerFrom: "team", playerOrigin: "team-3" }, "/players/sofascore-player-7?view=profile&from=team&origin=team-3"],
  ])("drops a tampered profile context, keeping the player, for %j", (extra, expected) => {
    expect(observedMatchReturnHref({ from: "player", player: "sofascore-player-7", ...extra })).toBe(expected);
  });
});
