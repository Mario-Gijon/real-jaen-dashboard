"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { ApiRequestError, getObservedMatchDetail, getSource } from "@/client/api";
import type { LocalReplacement, MatchStatus, ObservedMatchDetail, ObservedTeam } from "@/contract";
import { Button } from "@/ui/Button";
import { ProvenanceNotice } from "@/ui/ProvenanceNotice";
import { TeamCrest } from "@/ui/TeamCrest";
import { dateLabel } from "../format";
import { relatedObservedMatchHref } from "../players/navigation";
import { useApi } from "../use-api";
import { TeamStatsComparison } from "./MatchDetailView";
import { ObservedLineups } from "./ObservedLineups";
import { observedCrest } from "./ObservedMatchList";
import css from "./MatchDetailView.module.css";

const STATUS: Record<MatchStatus, string> = { finished: "Finalizado", scheduled: "Programado", postponed: "Aplazado" };
/** The synthetic detail's tabs without «Cronología»: no real timeline yet. */
const SECTIONS = ["summary", "lineups"] as const;
type Section = (typeof SECTIONS)[number];
const LABEL: Record<Section, string> = { summary: "Resumen", lineups: "Alineaciones" };
const timeFormat = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
});

/**
 * Detail of a real match (reached from the real match list, a real profile,
 * a team in «Equipos» or «Inicio», to which «Volver» then returns), organised like
 * the synthetic detail: header, then «Resumen» (team stats) and
 * «Alineaciones» (line-ups marked with the recorded goals, assists and
 * substitutions). Each section keeps its own state and retry, with
 * provenance. Loads nothing synthetic; an id the real source does not know is
 * said so, never looked up among the synthetic matches.
 */
export function RealMatchDetailView({ matchId, initialSection = "summary", playerReturnHref = null, teamsReturnHref = null, homeReturnHref = null, originQuery = {} }: {
  matchId: string; initialSection?: Section; playerReturnHref?: string | null; teamsReturnHref?: string | null; homeReturnHref?: string | null;
  /** The query this match was opened with: a related match keeps its origin. */
  originQuery?: Record<string, unknown>;
}) {
  const source = useApi("source", (signal) => getSource({ signal }));
  const real = source.data?.realSections.includes("matches") ?? false;
  const detail = useApi(real ? `observed-match|${matchId}` : null, (signal) => getObservedMatchDetail(matchId, { signal }));
  const notFound = detail.error instanceof ApiRequestError && detail.error.status === 404;
  // Kept here so a section retry, which reloads the detail, stays on the same tab.
  const [section, setSection] = useState<Section>(initialSection);

  return <div className={css.page}>
    {playerReturnHref
      ? <Link href={playerReturnHref} className={css.back}>‹ Volver al jugador</Link>
      : teamsReturnHref ? <Link href={teamsReturnHref} className={css.back}>‹ Volver al equipo</Link>
      : homeReturnHref ? <Link href={homeReturnHref} className={css.back}>‹ Volver a Inicio</Link>
      : <Link href="/matches" className={css.back}>‹ Volver a partidos</Link>}
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
      : <Detail data={detail.data} retry={detail.retry} section={section} setSection={setSection}
        linkProfiles={source.data.realSections.includes("observedPlayers")}
        relatedHref={(id) => relatedObservedMatchHref(id, originQuery)} />}
  </div>;
}

function Failure({ title, retry }: { title: string; retry: () => void }) {
  return <div role="alert" className={css.message}>
    <h1>{title}</h1>
    <Button size="sm" onClick={retry}>Reintentar</Button>
  </div>;
}

function Detail({ data, retry, linkProfiles, section, setSection, relatedHref }: {
  data: ObservedMatchDetail; retry: () => void; linkProfiles: boolean; section: Section; setSection: (section: Section) => void;
  relatedHref: (matchId: string) => string;
}) {
  const { match, scope, source } = data;
  const tabs = useRef<HTMLDivElement>(null);
  function moveTab(event: KeyboardEvent<HTMLButtonElement>) {
    const index = SECTIONS.indexOf(section);
    const next = event.key === "Home" ? "summary" : event.key === "End" ? "lineups"
      : event.key === "ArrowLeft" ? SECTIONS[(index + SECTIONS.length - 1) % SECTIONS.length]
        : event.key === "ArrowRight" ? SECTIONS[(index + 1) % SECTIONS.length] : null;
    if (!next) return;
    event.preventDefault();
    setSection(next);
    tabs.current?.querySelector<HTMLButtonElement>(`#match-${next}-tab`)?.focus();
  }
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
    {data.localReplacement ? <div className={css.provenance}>
      <LocalReplacementNotice replacement={data.localReplacement} relatedHref={relatedHref} />
    </div> : null}
    <div className={css.provenance}><ProvenanceNotice source={source}><p>{scope}</p></ProvenanceNotice></div>
    <div className={css.tabs} role="tablist" aria-label="Secciones del partido" ref={tabs}>
      {SECTIONS.map((id) => <button key={id} type="button" role="tab" id={`match-${id}-tab`} aria-selected={section === id}
        tabIndex={section === id ? 0 : -1} onClick={() => setSection(id)} onKeyDown={moveTab}
        aria-controls={`match-${id}-panel`} className={css.tab}>{LABEL[id]}</button>)}
    </div>
    <section role="tabpanel" id={`match-${section}-panel`} aria-labelledby={`match-${section}-tab`} className={css.summary}>
      {section === "summary" ? <Summary data={data} retry={retry} /> : <Lineups data={data} retry={retry} linkProfiles={linkProfiles} />}
    </section>
  </>;
}

const LOCAL_DECISION = { synthetic: false, label: "Decisión local" } as const;
const decision = (r: LocalReplacement) => `Decidido por ${r.decidedBy} el ${dateLabel(r.decidedOn)}. No es un dato de la fuente: SofaScore no enlaza los dos eventos.`;

/** A local decision on this event, said as such, with a link to the other event. */
function LocalReplacementNotice({ replacement: { replacedBy, replaces }, relatedHref }: {
  replacement: NonNullable<ObservedMatchDetail["localReplacement"]>; relatedHref: (matchId: string) => string;
}) {
  return <ProvenanceNotice source={LOCAL_DECISION}>
    {replacedBy ? <>
      <p>Este evento está sustituido por otro y no cuenta como encuentro vigente ni pendiente. {replacedBy.reason}</p>
      <p>{decision(replacedBy)}</p>
      <p><Link href={relatedHref(replacedBy.matchId)}>Ver el encuentro vigente</Link></p>
    </> : replaces.map((r) => <div key={r.matchId}>
      <p>Este encuentro sustituye a un evento anterior, que se conserva sin contar en el calendario. {r.reason}</p>
      <p>{decision(r)}</p>
      <p><Link href={relatedHref(r.matchId)}>Ver el evento sustituido</Link></p>
    </div>)}
  </ProvenanceNotice>;
}

function Summary({ data: { match, statistics }, retry }: { data: ObservedMatchDetail; retry: () => void }) {
  const home = match.home.name ?? "Equipo sin identificar";
  const away = match.away.name ?? "Equipo sin identificar";
  return <>
    <h2 className={css.summaryTitle}>Estadísticas de equipo</h2>
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
  </>;
}

function Lineups({ data: { match, lineups, incidents }, retry, linkProfiles }: {
  data: ObservedMatchDetail; retry: () => void; linkProfiles: boolean;
}) {
  if (lineups.state === "error") return <div role="alert" className={css.sectionError}>
    <p>No se pudieron cargar las alineaciones de este partido.</p>
    <Button size="sm" onClick={retry}>Reintentar</Button>
  </div>;
  if (lineups.state !== "stored") return <p className={css.empty} role="status">
    {lineups.state === "empty"
      ? "La fuente guardó las alineaciones de este partido sin jugadores."
      : "La fuente no tiene alineaciones guardadas de este partido."}
  </p>;
  return <>
    <ObservedLineups match={match} confirmed={lineups.confirmed} home={lineups.home} away={lineups.away}
      linkProfiles={linkProfiles} incidents={incidents} retry={retry} />
    {lineups.fetchedAt ? <p className={css.fetched}>Alineaciones obtenidas de la fuente el {dateLabel(lineups.fetchedAt)}.</p> : null}
  </>;
}

function Team({ team, side }: { team: ObservedTeam; side: "home" | "away" }) {
  return <div className={`${css.team} ${css[side]}`}>
    <TeamCrest team={observedCrest(team)} size={52} />
    <span>{observedCrest(team).name}</span>
  </div>;
}
