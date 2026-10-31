import Link from "next/link";
import type { MatchSummary, TeamRef } from "@/contract";
import { TeamCrest } from "@/ui/TeamCrest";
import { dateLabel } from "@/lib/format";
import css from "./MatchList.module.css";

const STATUS = { finished: "Finalizado", scheduled: "Programado", postponed: "Aplazado" };
const timeFormat = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
});

/** Dated matches are chronological; undated matches remain visible at the end, by round. */
export function MatchList({ matches, showRound }: { matches: readonly MatchSummary[]; showRound: boolean }) {
  const ordered = [...matches].sort((a, b) => {
    if (a.kickoff === null && b.kickoff !== null) return 1;
    if (b.kickoff === null && a.kickoff !== null) return -1;
    return (a.kickoff ?? "").localeCompare(b.kickoff ?? "")
      || a.round - b.round || a.id.localeCompare(b.id);
  });
  return (
    <ul className={css.list} aria-label="Partidos de la temporada">
      {ordered.map((match) => {
        const central = match.status === "finished" && match.score
          ? `${match.score.home} – ${match.score.away}`
          : match.status === "postponed" ? "Aplazado"
            : match.kickoff ? timeFormat.format(new Date(match.kickoff)) : "Por definir";
        const date = match.kickoff ? dateLabel(match.kickoff) : "Fecha por definir";
        return (
          <li key={match.id}>
            <Link
              className={css.match}
              href={`/matches/${encodeURIComponent(match.id)}`}
              prefetch={false}
              aria-label={`${match.home.name} contra ${match.away.name}, ${central}, jornada ${match.round}, ${date}${match.status === "postponed" ? "" : `, ${STATUS[match.status]}`}`}
            >
              <div className={css.meta}>
                {showRound ? <span className={css.round}>Jornada {match.round}</span> : null}
                {match.kickoff ? <time dateTime={match.kickoff}>{date}</time> : <span>{date}</span>}
              </div>
              <Team team={match.home} side="home" />
              <div className={css.center}>
                <strong className={match.status === "postponed" ? css.postponed : css.result}>{central}</strong>
                {match.status !== "postponed" ? <span className={css.state}>{STATUS[match.status]}</span> : null}
              </div>
              <Team team={match.away} side="away" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Team({ team, side }: { team: TeamRef; side: "home" | "away" }) {
  return <span className={`${css.team} ${css[side]}`}>
    <TeamCrest team={team} size={40} />
    <span className={css.name} data-club={team.id === "team-real-jaen" || undefined}>
      <span className={css.fullName}>{team.name}</span>
      <span className={css.shortName}>{team.shortName}</span>
    </span>
  </span>;
}
