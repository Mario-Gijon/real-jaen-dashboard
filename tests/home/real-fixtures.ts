import type {
  MatchResult, MatchStatus, ObservedCompetitionPerformance, ObservedMatch, ObservedMatchDetail, ObservedTeam,
  ObservedTeamMatches, ObservedTeamPerformance, Side, TeamMatchStats,
} from "@/contract";

/** A small real calendar: the club, the rival of its next match and other teams, as the local API serves them. */
export const NOW = Date.parse("2026-10-23T10:00:00Z");
export const jaen: ObservedTeam = { id: "team-real-jaen", name: "Real Jaén" };
export const rival: ObservedTeam = { id: "sofascore-team-24326", name: "Atlético Madrileño" };
export const later: ObservedTeam = { id: "sofascore-team-4489", name: "Algeciras CF" };
export const other: ObservedTeam = { id: "sofascore-team-2840", name: "Gimnàstic de Tarragona" };
const SOURCE = { synthetic: false, label: "Datos reales" } as const;

export function observed(id: number, kickoff: string | null, status: MatchStatus | null, home: ObservedTeam, away: ObservedTeam,
  round: number | null, score: ObservedMatch["score"] = null): ObservedMatch {
  // The provider's own competition name, unlike the scope's.
  return { id: `sofascore-match-${id}`, kickoff, status, competition: "Primera Federacion, Group 2", season: "26/27", round, home, away, score };
}
export const rowOf = (match: ObservedMatch, team: ObservedTeam) => ({ match, side: (match.home.id === team.id ? "home" : "away") as Side });

/** The club: J8 played, J9 against the rival on 25-10, J10 against another team on 02-11, a postponed J5. */
export const target = observed(9, "2026-10-25T11:00:00Z", "scheduled", rival, jaen, 9);
export const next = observed(10, "2026-11-02T17:15:00Z", "scheduled", jaen, later, 10);
export const postponed = observed(5, "2026-09-27T16:15:00Z", "postponed", jaen, other, 5);
export const clubMatches = (matches: ObservedMatch[] = [observed(8, "2026-10-18T16:15:00Z", "finished", jaen, other, 8, { home: 1, away: 0 }), target, next]): ObservedTeamMatches => ({
  teamId: jaen.id, matches: matches.map((m) => rowOf(m, jaen)),
  competitions: [{ name: "Primera Federación, Grupo 2", season: "26/27" }], scope: "Partidos del equipo.", source: SOURCE,
});

/** The rival: six finished matches before the target (J7 later than J8 by date), one after it, and the target itself. */
export const rivalPlayed = [
  observed(101, "2026-09-12T17:00:00Z", "finished", rival, other, 1, { home: 1, away: 0 }),
  observed(102, "2026-09-19T17:00:00Z", "finished", other, rival, 2, { home: 0, away: 0 }),
  observed(103, "2026-09-26T17:00:00Z", "finished", rival, other, 3, { home: 2, away: 2 }),
  observed(104, "2026-10-03T17:00:00Z", "finished", other, rival, 4, { home: 3, away: 2 }),
  observed(108, "2026-10-11T17:00:00Z", "finished", rival, other, 8, { home: 4, away: 4 }),
  observed(107, "2026-10-18T14:00:00Z", "finished", other, rival, 7, { home: 2, away: 1 }),
];
/** Played after the target and before the club's following match. */
export const afterTarget = observed(110, "2026-10-29T17:00:00Z", "finished", rival, other, 10, { home: 5, away: 0 });
export const rivalMatches = (matches: ObservedMatch[] = [...rivalPlayed, target, afterTarget], team = rival): ObservedTeamMatches => ({
  teamId: team.id, matches: matches.map((m) => rowOf(m, team)),
  competitions: [{ name: "Primera Federación, Grupo 2", season: "26/27" }], scope: "Partidos del equipo.", source: SOURCE,
});

const resultOf = (match: ObservedMatch, side: Side): MatchResult => {
  const own = match.score![side], against = match.score![side === "home" ? "away" : "home"];
  return own > against ? "win" : own === against ? "draw" : "loss";
};
/** The rival's performance: `counted` are the matches the source counts (all the finished ones by default). */
export function rivalPerformance(counted: ObservedMatch[] = [...rivalPlayed, afterTarget], team = rival): ObservedTeamPerformance {
  const results = counted.map((match) => {
    const { side } = rowOf(match, team);
    return { match, side, result: resultOf(match, side), goalsFor: match.score![side], goalsAgainst: match.score![side === "home" ? "away" : "home"] };
  });
  const competition = { id: "sofascore-scope-94191-97382", name: "Primera Federación, Grupo 2", season: "26/27", results } as unknown as ObservedCompetitionPerformance;
  return { teamId: team.id, competitions: [competition], teams: [jaen, rival, later], scope: "Rendimiento.", source: SOURCE };
}

const missing = { value: null, reason: "not_available" } as const;
export const stats = (xg: number | null): TeamMatchStats => ({
  possession: missing, shots: missing, shotsOnTarget: missing, xg: xg === null ? missing : { value: xg },
  corners: missing, fouls: missing, yellowCards: missing, redCards: missing,
});
const notStored = { state: "not_stored", fetchedAt: null } as const;
/** A match detail with the xG of each side (home, away), or with its statistics in another state. */
export function detailOf(match: ObservedMatch, xg: [number | null, number | null] | ObservedMatchDetail["statistics"]["state"]): ObservedMatchDetail {
  const statistics: ObservedMatchDetail["statistics"] = Array.isArray(xg)
    ? { state: "stored", fetchedAt: null, home: stats(xg[0]), away: stats(xg[1]) }
    : { state: xg as Exclude<ObservedMatchDetail["statistics"]["state"], "stored">, fetchedAt: null };
  return { match, statistics, lineups: notStored, incidents: notStored, scope: "Detalle.", source: SOURCE };
}
