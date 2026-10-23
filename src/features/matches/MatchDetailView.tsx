"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { ApiRequestError, getCompetitions, getMatch } from "@/client/api";
import type { MatchDetail, Stat, TeamMatchStats, TeamRef, TeamStatKey } from "@/contract";
import { Button } from "@/ui/Button";
import { TeamCrest } from "@/ui/TeamCrest";
import { dateLabel, statText } from "../format";
import { useApi } from "../use-api";
import { MatchTimeline } from "./MatchTimeline";
import { MatchLineups } from "./MatchLineups";
import css from "./MatchDetailView.module.css";

const STATUS = { finished: "Finalizado", scheduled: "Programado", postponed: "Aplazado" };
const SECTIONS = ["summary", "timeline", "lineups"] as const;
const timeFormat = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
});
const METRICS: readonly { key: TeamStatKey; label: string; decimals?: number }[] = [
  { key: "xg", label: "xG", decimals: 2 },
  { key: "shots", label: "Tiros" },
  { key: "shotsOnTarget", label: "Tiros a puerta" },
  { key: "possession", label: "Posesión" },
  { key: "corners", label: "Córners" },
  { key: "fouls", label: "Faltas" },
  { key: "yellowCards", label: "Amarillas" },
  { key: "redCards", label: "Rojas" },
];

/** `homeReturnHref`: the «Inicio» this match was opened from, to which «Volver» returns; otherwise Partidos. */
export function MatchDetailView({ matchId, initialSection = "summary", homeReturnHref = null }: {
  matchId: string; initialSection?: (typeof SECTIONS)[number]; homeReturnHref?: string | null;
}) {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>(initialSection);
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
  const detail = useApi(`match|${matchId}`, (signal) => getMatch(matchId, { signal }));
  const competitions = useApi("competitions", (signal) => getCompetitions({ signal }));
  const match = detail.data;
  const competition = competitions.data?.find((c) => c.seasons.some((s) => s.id === match?.seasonId));
  const season = competition?.seasons.find((s) => s.id === match?.seasonId);
  const notFound = detail.error instanceof ApiRequestError && detail.error.status === 404;

  return <div className={css.page}>
    {homeReturnHref ? <Link href={homeReturnHref} className={css.back}>‹ Volver a Inicio</Link>
      : <Link href="/matches" className={css.back}>‹ Volver a partidos</Link>}
    {detail.error ? <div role="alert" className={css.message}>
      <h1>{notFound ? "Partido no encontrado" : "No se pudo cargar el partido"}</h1>
      {!notFound ? <Button size="sm" onClick={detail.retry}>Reintentar</Button> : null}
    </div> : !match ? <p role="status" className={css.message}>Cargando partido…</p> : <>
      <header className={css.header}>
        <h1 className={css.matchHeading}>{match.home.name} contra {match.away.name}</h1>
        {competition && season ? <p className={css.competition}>{competition.name} · {season.name}</p> : null}
        <p className={css.context}>
          <span>Jornada {match.round}</span>
          {match.kickoff ? <time dateTime={match.kickoff}>
            {dateLabel(match.kickoff)} · {timeFormat.format(new Date(match.kickoff))}
          </time> : <span>Fecha por definir</span>}
        </p>
        <div className={css.fixture}>
          <Team team={match.home} side="home" />
          <div className={css.center}>
            <strong className={css.result} data-state={match.status}>
              {match.status === "finished" && match.score
                ? `${match.score.home} – ${match.score.away}`
                : match.status === "postponed" ? "—"
                  : match.kickoff ? timeFormat.format(new Date(match.kickoff)) : "Por definir"}
            </strong>
            <span className={css.state}>{STATUS[match.status]}</span>
          </div>
          <Team team={match.away} side="away" />
        </div>
      </header>
      <div className={css.tabs} role="tablist" aria-label="Secciones del partido" ref={tabs}>
        <button type="button" role="tab" id="match-summary-tab" aria-selected={section === "summary"}
          tabIndex={section === "summary" ? 0 : -1} onClick={() => setSection("summary")} onKeyDown={moveTab}
          aria-controls="match-summary-panel" className={css.tab}>Resumen</button>
        <button type="button" role="tab" id="match-timeline-tab" aria-selected={section === "timeline"}
          tabIndex={section === "timeline" ? 0 : -1} onClick={() => setSection("timeline")} onKeyDown={moveTab}
          aria-controls="match-timeline-panel" className={css.tab}>Cronología</button>
        <button type="button" role="tab" id="match-lineups-tab" aria-selected={section === "lineups"}
          tabIndex={section === "lineups" ? 0 : -1} onClick={() => setSection("lineups")} onKeyDown={moveTab}
          aria-controls="match-lineups-panel" className={css.tab}>Alineaciones</button>
      </div>
      <section role="tabpanel" id={`match-${section}-panel`} aria-labelledby={`match-${section}-tab`} className={css.summary}>
        {section === "summary" ? <Summary match={match} />
          : section === "timeline" ? <MatchTimeline match={match} /> : <MatchLineups match={match} />}
      </section>
    </>}
  </div>;
}

function Team({ team, side }: { team: TeamRef; side: "home" | "away" }) {
  return <div className={`${css.team} ${css[side]}`}>
    <TeamCrest team={team} size={52} />
    <span>{team.name}</span>
  </div>;
}

function Summary({ match }: { match: MatchDetail }) {
  if (!match.teamStats) return <p className={css.empty} role="status">
    {match.status === "scheduled" ? "Las estadísticas estarán disponibles después del partido."
      : match.status === "postponed" ? "Partido aplazado. No hay estadísticas disponibles."
        : "No hay estadísticas disponibles para este partido."}
  </p>;

  return <>
    <h2 className={css.summaryTitle}>Estadísticas de equipo</h2>
    <TeamStatsComparison home={{ label: match.home.shortName, name: match.home.name, stats: match.teamStats.home }}
      away={{ label: match.away.shortName, name: match.away.name, stats: match.teamStats.away }} />
  </>;
}

type StatsSide = { label: string; name: string; stats: TeamMatchStats };

/** Home and away team stats face to face; a missing value reads «—», a real 0 reads «0». */
export function TeamStatsComparison({ home: homeSide, away: awaySide }: { home: StatsSide; away: StatsSide }) {
  return <>
    <div className={css.legend} aria-hidden="true">
      <span>{homeSide.label} · Local</span><span>{awaySide.label} · Visitante</span>
    </div>
    <dl className={css.metrics}>
      {METRICS.map(({ key, label, decimals = 0 }) => {
        const home = homeSide.stats[key];
        const away = awaySide.stats[key];
        const maximum = home.value !== null && away.value !== null ? Math.max(home.value, away.value) : 0;
        const comparable = home.value !== null && away.value !== null && maximum > 0;
        return <div className={css.metric} key={key}>
          <dt>{label}</dt>
          <dd className={css.homeValue}><Value stat={home} decimals={decimals}
            team={homeSide.name} percent={key === "possession"} /></dd>
          <dd className={css.awayValue}><Value stat={away} decimals={decimals}
            team={awaySide.name} percent={key === "possession"} /></dd>
          <dd className={css.comparison} aria-hidden="true" data-comparison={comparable || undefined}>
            <span className={css.homeHalf}>
              {comparable && home.value! > 0 ? <span data-bar="home" style={{ width: `${home.value! / maximum * 100}%` }} /> : null}
            </span>
            <span className={css.awayHalf}>
              {comparable && away.value! > 0 ? <span data-bar="away" style={{ width: `${away.value! / maximum * 100}%` }} /> : null}
            </span>
          </dd>
        </div>;
      })}
    </dl>
  </>;
}

function Value({ stat, decimals, team, percent }: {
  stat: Stat; decimals: number; team: string; percent: boolean;
}) {
  const missing = stat.value === null;
  const text = missing ? "—" : stat.value === 0 ? "0" : statText(stat, decimals);
  const reason = missing ? stat.reason === "not_collected" ? "Dato no recogido" : "Dato no disponible" : null;
  return <span aria-label={`${team}: ${reason ?? `${text}${percent ? " %" : ""}`}`} title={reason ?? undefined}>
    {text}{!missing && percent ? " %" : ""}
  </span>;
}
