"use client";

import Link from "next/link";
import { ApiRequestError, getObservedMatchDetail, getSource } from "@/client/api";
import type { MatchStatus, ObservedMatchDetail, ObservedTeam } from "@/contract";
import { Button } from "@/ui/Button";
import { ProvenanceNotice } from "@/ui/ProvenanceNotice";
import { TeamCrest } from "@/ui/TeamCrest";
import { dateLabel } from "../format";
import { useApi } from "../use-api";
import { TeamStatsComparison } from "./MatchDetailView";
import { observedCrest } from "./ObservedMatchList";
import css from "./MatchDetailView.module.css";

const STATUS: Record<MatchStatus, string> = { finished: "Finalizado", scheduled: "Programado", postponed: "Aplazado" };
const timeFormat = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
});

/**
 * Detail of a real match (reached from the real match list): header and team
 * stats as the source keeps them, with provenance. Loads nothing synthetic;
 * an id the real source does not know is said so, never looked up among the
 * synthetic matches. No interpreted events or narrative.
 */
export function RealMatchDetailView({ matchId }: { matchId: string }) {
  const source = useApi("source", (signal) => getSource({ signal }));
  const real = source.data?.realSections.includes("matches") ?? false;
  const detail = useApi(real ? `observed-match|${matchId}` : null, (signal) => getObservedMatchDetail(matchId, { signal }));
  const notFound = detail.error instanceof ApiRequestError && detail.error.status === 404;

  return <div className={css.page}>
    <Link href="/matches" className={css.back}>‹ Volver a partidos</Link>
    {source.error ? <Failure title="No se pudo determinar la fuente de los partidos" retry={source.retry} />
      : !source.data ? <p role="status" className={css.message}>Cargando partido…</p>
      : !real ? <div role="status" className={css.message}>
        <h1>La fuente real de partidos no está activada</h1>
        <p>Este enlace corresponde a un partido real.</p>
      </div>
      : notFound ? <div role="alert" className={css.message}>
        <h1>Partido no encontrado en la fuente real</h1>
      </div>
      : detail.error ? <Failure title="No se pudo cargar el partido" retry={detail.retry} />
      : !detail.data ? <p role="status" className={css.message}>Cargando partido…</p>
      : <Detail data={detail.data} retry={detail.retry} />}
  </div>;
}

function Failure({ title, retry }: { title: string; retry: () => void }) {
  return <div role="alert" className={css.message}>
    <h1>{title}</h1>
    <Button size="sm" onClick={retry}>Reintentar</Button>
  </div>;
}

function Detail({ data: { match, statistics, scope, source }, retry }: { data: ObservedMatchDetail; retry: () => void }) {
  const home = match.home.name ?? "Equipo sin identificar";
  const away = match.away.name ?? "Equipo sin identificar";
  const context = [match.competition, match.season].filter(Boolean).join(" · ");
  const central = match.status === "finished"
    ? match.score ? `${match.score.home} – ${match.score.away}` : "—"
    : match.status === "scheduled" && match.kickoff ? timeFormat.format(new Date(match.kickoff))
      : match.status === "scheduled" ? "Por definir" : "—";
  const state = match.status === null ? "Estado desconocido"
    : match.status === "finished" && !match.score ? "Finalizado · sin resultado" : STATUS[match.status];
  return <>
    <header className={css.header}>
      <h1 className={css.matchHeading}>{home} contra {away}</h1>
      {context ? <p className={css.competition}>{context}</p> : null}
      <p className={css.context}>
        {match.round !== null ? <span>Jornada {match.round}</span> : null}
        {match.kickoff ? <time dateTime={match.kickoff}>
          {dateLabel(match.kickoff)} · {timeFormat.format(new Date(match.kickoff))}
        </time> : <span>Fecha por definir</span>}
      </p>
      <div className={css.fixture}>
        <Team team={match.home} side="home" />
        <div className={css.center}>
          <strong className={css.result} data-state={match.status === "finished" && match.score ? "finished" : "scheduled"}>{central}</strong>
          <span className={css.state}>{state}</span>
        </div>
        <Team team={match.away} side="away" />
      </div>
    </header>
    <ProvenanceNotice source={source}><p>{scope}</p></ProvenanceNotice>
    <section aria-labelledby="real-match-stats" className={css.summary}>
      <h2 id="real-match-stats" className={css.summaryTitle}>Estadísticas de equipo</h2>
      {statistics.state === "stored" ? <>
        <TeamStatsComparison home={{ label: home, name: home, stats: statistics.home }}
          away={{ label: away, name: away, stats: statistics.away }} />
        {statistics.fetchedAt ? <p className={css.fetched}>Obtenidas de la fuente el {dateLabel(statistics.fetchedAt)}.</p> : null}
      </>
        : statistics.state === "error" ? <div role="alert" className={css.sectionError}>
          <p>No se pudieron cargar las estadísticas de este partido.</p>
          <Button size="sm" onClick={retry}>Reintentar</Button>
        </div>
        : <p className={css.empty} role="status">
          {statistics.state === "empty"
            ? "La fuente guardó las estadísticas de este partido sin contenido."
            : "La fuente no tiene estadísticas guardadas de este partido."}
        </p>}
    </section>
  </>;
}

function Team({ team, side }: { team: ObservedTeam; side: "home" | "away" }) {
  return <div className={`${css.team} ${css[side]}`}>
    <TeamCrest team={observedCrest(team)} size={52} />
    <span>{observedCrest(team).name}</span>
  </div>;
}
