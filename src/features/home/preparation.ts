import { seasonStat, type MatchSummary, type Stat, type TeamMatch } from "@/contract";
import { average } from "../teams/performance";

export const CLUB_ID = "team-real-jaen";
const timestamp = (value: string | null) => value ? Date.parse(value) : NaN;

/** Only dated, scheduled club matches ahead of the current time are suggestions. */
export function upcomingMatches(matches: readonly MatchSummary[], now: number) {
  return matches.filter(match => (match.home.id === CLUB_ID || match.away.id === CLUB_ID)
    && match.status === "scheduled" && timestamp(match.kickoff) > now)
    .sort((a, b) => timestamp(a.kickoff) - timestamp(b.kickoff) || a.id.localeCompare(b.id));
}

/** The five latest finished matches before the target; unknown dates cannot establish that a match preceded it. */
export function preparationHistory(matches: readonly TeamMatch[], target: MatchSummary) {
  const ordered = matches.filter(({ match }) => match.status === "finished"
    && timestamp(match.kickoff) < timestamp(target.kickoff))
    .sort((a, b) => timestamp(b.match.kickoff) - timestamp(a.match.kickoff)
      || b.match.round - a.match.round || a.match.id.localeCompare(b.match.id));
  return ordered.slice(0, 5);
}

export function preparationSummary(matches: readonly TeamMatch[]) {
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
