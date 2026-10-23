import Link from "next/link";
import type { MatchStatus, ObservedMatch, ObservedTeam } from "@/contract";
import { TeamCrest } from "@/ui/TeamCrest";
import { CLUB_ID } from "../club";
import { observedMatchHref } from "../players/navigation";
import { dateLabel } from "../format";
import { observedCrest } from "../team-crests";
import css from "./MatchList.module.css";

const STATUS: Record<MatchStatus, string> = { finished: "Finalizado", scheduled: "Programado", postponed: "Aplazado" };
const timeFormat = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
});

/**
 * Real matches as the source lists them, in the order given (by kickoff).
 * Same layout as the synthetic list; each row opens the real match detail,
 * explicitly marked as real (`view=observed`), never a synthetic one. Only a
 * finished match shows a score; a pending one shows its time or «Por
 * definir», never 0–0.
 */
export function ObservedMatchList({ matches }: { matches: readonly ObservedMatch[] }) {
  return (
    <ul className={css.list} aria-label="Partidos reales">
      {matches.map((match) => {
        const central = match.status === "finished"
          ? match.score ? `${match.score.home} – ${match.score.away}` : "—"
          : match.status === "postponed" ? "Aplazado"
            : match.status === "scheduled" && match.kickoff ? timeFormat.format(new Date(match.kickoff))
              : match.status === "scheduled" ? "Por definir" : "—";
        const state = match.status === null ? "Estado desconocido"
          : match.status === "finished" && !match.score ? "Finalizado · sin resultado"
            : match.status === "postponed" ? null : STATUS[match.status];
        const date = match.kickoff ? dateLabel(match.kickoff) : "Fecha por definir";
        const seasonRound = [match.season, match.round !== null ? `J${match.round}` : null].filter(Boolean).join(" · ");
        return (
          <li key={match.id}>
            <Link
              className={css.match}
              data-observed=""
              href={observedMatchHref(match.id)}
              prefetch={false}
              aria-label={`${match.home.name ?? "Equipo sin identificar"} contra ${match.away.name ?? "Equipo sin identificar"}, ${central}, ${[match.competition, match.season].filter(Boolean).join(" ")}, ${date}${state ? `, ${state}` : ""}`}
            >
              <div className={css.meta}>
                {match.competition ? <span className={css.round}>{match.competition}</span> : null}
                {seasonRound ? <span>{seasonRound}</span> : null}
                {match.kickoff ? <time dateTime={match.kickoff}>{date}</time> : <span>{date}</span>}
              </div>
              <Team team={match.home} side="home" />
              <div className={css.center}>
                <strong className={match.status === "finished" && match.score ? css.result : css.postponed}>{central}</strong>
                {state ? <span className={css.state}>{state}</span> : null}
              </div>
              <Team team={match.away} side="away" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}


function Team({ team, side }: { team: ObservedTeam; side: "home" | "away" }) {
  const name = team.name ?? "Equipo sin identificar";
  const club = team.id === CLUB_ID;
  return <span className={`${css.team} ${css[side]}`}>
    <TeamCrest team={observedCrest(team)} size={40} />
    <span className={css.name} data-club={club || undefined}>
      <span className={css.fullName}>{name}</span>
      <span className={css.shortName}>{name}</span>
    </span>
  </span>;
}
