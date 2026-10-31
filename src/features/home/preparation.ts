import { seasonStat, type MatchStatus, type Stat, type TeamMatch } from "@/contract";
import { CLUB_ID } from "@/lib/club";
import { average, type OrientedMatch } from "../teams/performance";

export const timestamp = (value: string | null) => value ? Date.parse(value) : NaN;

/**
 * What the derivations read from a match: a synthetic `MatchSummary` and a
 * real `ObservedMatch` both are one (a real round or status may be unknown).
 */
export type DatedMatch = {
  id: string; kickoff: string | null; status: MatchStatus | null; round: number | null;
  home: { id: string }; away: { id: string };
};

/** Only dated, scheduled club matches ahead of the current time are suggestions. */
export function upcomingMatches<T extends DatedMatch>(matches: readonly T[], now: number): T[] {
  return matches.filter(match => (match.home.id === CLUB_ID || match.away.id === CLUB_ID)
    && match.status === "scheduled" && timestamp(match.kickoff) > now)
    .sort((a, b) => timestamp(a.kickoff) - timestamp(b.kickoff) || a.id.localeCompare(b.id));
}

/** The next six fixtures for the selector; a chosen target further ahead takes the sixth place. */
export function preparationChoices<T extends DatedMatch>(future: readonly T[], target: T | undefined): T[] {
  return target && !future.slice(0, 6).some(match => match.id === target.id)
    ? [...future.slice(0, 5), target].sort((a, b) => timestamp(a.kickoff) - timestamp(b.kickoff)) : future.slice(0, 6);
}

/** The five latest finished matches before the target; unknown dates cannot establish that a match preceded it. */
export function preparationHistory<T extends { match: DatedMatch }>(matches: readonly T[], target: Pick<DatedMatch, "kickoff">): T[] {
  const ordered = matches.filter(({ match }) => match.status === "finished"
    && timestamp(match.kickoff) < timestamp(target.kickoff))
    .sort((a, b) => timestamp(b.match.kickoff) - timestamp(a.match.kickoff)
      || (b.match.round ?? 0) - (a.match.round ?? 0) || a.match.id.localeCompare(b.match.id));
  return ordered.slice(0, 5);
}

/** Form, goals and xG of some matches from the analysed team's side; each figure with its coverage. */
export function preparationSummary(matches: readonly (OrientedMatch & Pick<TeamMatch, "result">)[]) {
  const goals = (conceded: boolean) => seasonStat(matches.map(({ match, side }): Stat =>
    match.score ? { value: match.score[conceded ? side === "home" ? "away" : "home" : side] }
      : { value: null, reason: "not_available" }));
  return {
    wins: matches.filter(match => match.result === "win").length,
    draws: matches.filter(match => match.result === "draw").length,
    losses: matches.filter(match => match.result === "loss").length,
    goalsFor: goals(false), goalsAgainst: goals(true),
    xg: average(matches, "xg"), opponentXg: average(matches, "xgAgainst"),
  };
}

/** Calendar-day difference in the application's Spain timezone, not a rounded duration. */
export function daysUntil(kickoff: string | null, now: number) {
  const time = timestamp(kickoff);
  if (!Number.isFinite(time) || time <= now) return null;
  const format = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Madrid",
  });
  const day = (date: number) => {
    const parts = format.formatToParts(date);
    const value = (type: string) => Number(parts.find(part => part.type === type)!.value);
    return Date.UTC(value("year"), value("month") - 1, value("day"));
  };
  return (day(time) - day(now)) / 86_400_000;
}
