import type { MatchResult, ObservedCompetitionPerformance, ObservedMatch, ObservedMatchDetail, Side, TeamMatch } from "@/contract";
import { preparationHistory, timestamp } from "./preparation";

/**
 * «Inicio» with a real source: the same rules as the synthetic one
 * (`upcomingMatches`, `preparationHistory`, `preparationSummary`) over the
 * matches the source lists, plus what a real calendar needs said. The source
 * already leaves out events replaced by a local decision; nothing here
 * removes or recounts any other match.
 */

export type ObservedRow = { match: ObservedMatch; side: Side };

const dated = (match: ObservedMatch) => Number.isFinite(timestamp(match.kickoff));
/** Scheduled or postponed: known not to be played yet. An unknown status is neither. */
const notPlayed = (match: ObservedMatch) => match.status === "scheduled" || match.status === "postponed";

/**
 * Club matches never proposed as the target, said so: a postponed one is
 * still to be played but has no confirmed new date (its kickoff is the
 * original one); a scheduled one whose kickoff has passed means the imported
 * data may not be up to date; one whose status the app does not know
 * (`null`) is never guessed into either. Oldest first, undated last.
 */
export function unconfirmedClubMatches(rows: readonly ObservedRow[], now: number) {
  const byDate = [...rows].sort((a, b) => (timestamp(a.match.kickoff) || Infinity) - (timestamp(b.match.kickoff) || Infinity));
  return {
    postponed: byDate.filter(({ match }) => match.status === "postponed").map(({ match }) => match),
    stale: byDate.filter(({ match }) => match.status === "scheduled" && dated(match) && timestamp(match.kickoff) <= now)
      .map(({ match }) => match),
    unknownStatus: byDate.filter(({ match }) => match.status === null).map(({ match }) => match),
  };
}

/** A match of the rival's window, with its result only when the source counts it (`results` of its performance). */
export type HistoryEntry = ObservedRow & { result: MatchResult | null };

/**
 * The rival's last five finished matches before the target (`preparationHistory`)
 * and what the window leaves out. A finished match the source does not count
 * (no valid score, or contradictory versions) is listed without a result and
 * stays out of the summary. Only counted, never guessed into the window:
 * matches before the target still to be played (dated after `now`), those
 * whose date has passed and still have no result (postponed, or not updated
 * in the imported data), those with a status the app does not know, dated
 * before the target or undated (never read as played or pending), and
 * finished ones without a date.
 */
export function rivalHistory(rows: readonly ObservedRow[], target: ObservedMatch,
  competitions: readonly ObservedCompetitionPerformance[], now: number) {
  const counted = new Map(competitions.flatMap((c) => c.results.map((r) => [r.match.id, r.result] as const)));
  const recent: HistoryEntry[] = preparationHistory(rows, target)
    .map((row) => ({ ...row, result: counted.get(row.match.id) ?? null }));
  const before = rows.filter(({ match }) => dated(match) && timestamp(match.kickoff) < timestamp(target.kickoff));
  return {
    recent,
    counted: recent.filter((entry) => entry.result !== null),
    upcomingBefore: before.filter(({ match }) => notPlayed(match) && timestamp(match.kickoff) > now).length,
    overdueBefore: before.filter(({ match }) => notPlayed(match) && timestamp(match.kickoff) <= now).length,
    unknownStatus: rows.filter(({ match }) => match.status === null
      && (!dated(match) || timestamp(match.kickoff) < timestamp(target.kickoff))).length,
    undatedFinished: rows.filter(({ match }) => match.status === "finished" && !dated(match)).length,
  };
}

/**
 * The team stats of a real match seen from `side`, as `average` reads them
 * (`own`, `opponent`); `null` when the source keeps none for the match, so
 * every value is missing, never 0.
 */
export function orientedTeamStats(detail: ObservedMatchDetail, side: Side): TeamMatch["teamStats"] {
  const { statistics } = detail;
  if (statistics.state !== "stored") return null;
  return side === "home" ? { own: statistics.home, opponent: statistics.away } : { own: statistics.away, opponent: statistics.home };
}
