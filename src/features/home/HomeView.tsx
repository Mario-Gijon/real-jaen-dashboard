"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { getCompetitions, getSeasonMatches, getTeamSeason } from "@/client/api";
import type { MatchSummary, SeasonStat, TeamMatch } from "@/contract";
import { Button } from "@/ui/Button";
import { PageHeader } from "@/ui/PageHeader";
import { TeamCrest } from "@/ui/TeamCrest";
import { dateLabel, formatNumber } from "../format";
import { useApi } from "../use-api";
import { CLUB_ID, daysUntil, preparationHistory, preparationSummary, upcomingMatches } from "./preparation";
import css from "./HomeView.module.css";

export function HomeView({ seasonId, matchId, now }: { seasonId?: string; matchId?: string; now: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const selectorId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<HTMLDivElement>(null);
  const competitions = useApi("competitions", signal => getCompetitions({ signal }));
  const seasons = competitions.data?.flatMap(competition => competition.seasons) ?? [];
  const season = seasonId ? seasons.find(item => item.id === seasonId) : seasons[0];
  const calendar = useApi(season ? `preparation-calendar|${season.id}` : null,
    signal => getSeasonMatches(season!.id, { teamId: CLUB_ID }, { signal }));
  const future = upcomingMatches(calendar.data ?? [], now);
  const target = matchId ? future.find(match => match.id === matchId) : future[0];
  const rival = target ? target.home.id === CLUB_ID ? target.away : target.home : null;
  const team = useApi(season && rival ? `preparation-team|${season.id}|${rival.id}` : null,
    signal => getTeamSeason(season!.id, rival!.id, { signal }));
  const choices = target && !future.slice(0, 6).some(match => match.id === target.id)
    ? [...future.slice(0, 5), target].sort((a, b) => a.kickoff!.localeCompare(b.kickoff!)) : future.slice(0, 6);
  const days = target ? daysUntil(target.kickoff, now) : null;
  useEffect(() => {
    if (open) (options.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?? options.current?.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [open]);
  function close() { setOpen(false); trigger.current?.focus(); }
  function choose(match: MatchSummary) {
    router.push(`/?${new URLSearchParams({ season: season!.id, match: match.id })}`, { scroll: false });
    close();
  }

  return <div className={css.page}>
    <div className={css.heading}><PageHeader title="Preparación de rival" /></div>
    {competitions.error ? <LoadError message="No se pudieron cargar las temporadas." retry={competitions.retry} />
      : !competitions.data ? <p role="status" className={css.message}>Cargando preparación…</p>
        : !season ? <p role="alert" className={css.message}>{seasonId ? "Temporada no encontrada." : "No hay temporadas disponibles."}</p>
          : calendar.error ? <LoadError message="No se pudo cargar el calendario del Real Jaén." retry={calendar.retry} />
            : !calendar.data ? <p role="status" className={css.message}>Cargando calendario…</p>
              : <>
                <section className={css.target} aria-label="Encuentro de preparación">
                  <div className={css.context}>
                    <div className={css.encounterContext}>
                      <p>{target ? `Jornada ${target.round} · ${dateLabel(target.kickoff)} · ` : ""}{season.name}</p>
                    </div>
                    <Button ref={trigger} size="sm" aria-expanded={open} aria-controls={selectorId}
                      disabled={!future.length} onClick={() => open ? close() : setOpen(true)}>Cambiar rival</Button>
                  </div>
                  {!target ? <p className={css.message} role={matchId ? "alert" : "status"}>
                    {matchId ? "El encuentro seleccionado no es un próximo partido válido del Real Jaén. Elige otro encuentro."
                      : "No hay próximos encuentros con fecha disponible para preparar."}
                  </p> : <>
                    <div className={css.fixture}>
                      <FixtureTeam match={target} side="home" />
                      <span className={css.versus} aria-hidden="true">—</span>
                      <FixtureTeam match={target} side="away" />
                    </div>
                    <div className={css.preparationContext}>
                      {days !== null ? <p>{days === 0 ? "Partido hoy" : days === 1 ? "Partido mañana" : `Partido dentro de ${days} días`}</p> : null}
                    </div>
                    <div className={css.actions}>
                      <Link className={css.primaryLink} href={`/teams?${new URLSearchParams({ season: season.id, team: rival!.id })}`}>Analizar {rival!.shortName}</Link>
                      <Link className={css.secondaryLink} href={`/matches?${new URLSearchParams({ season: season.id, team: rival!.id, round: "all" })}`}>Sus partidos</Link>
                    </div>
                  </>}
                  {open ? <div ref={options} id={selectorId} role="region" aria-label="Próximos encuentros del Real Jaén"
                    className={css.options} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
                    {choices.map(match => {
                      const opponent = match.home.id === CLUB_ID ? match.away : match.home;
                      return <button type="button" key={match.id} aria-pressed={match.id === target?.id} onClick={() => choose(match)}>
                        <TeamCrest team={opponent} size={28} />
                        <span className={css.optionContent}><strong>Jornada {match.round} · {opponent.name}</strong><time dateTime={match.kickoff!}>{dateLabel(match.kickoff)}</time></span>
                        {match.id === target?.id ? <span className={css.current}>Actual</span> : null}
                      </button>;
                    })}
                  </div> : null}
                </section>
                {target && rival ? team.error ? <LoadError message="No se pudieron cargar los partidos del rival." retry={team.retry} />
                  : team.data ? <History matches={team.data.matches} target={target} />
                    : <p role="status" className={css.message}>Cargando partidos del rival…</p> : null}
              </>}
  </div>;
}

function FixtureTeam({ match, side }: { match: MatchSummary; side: "home" | "away" }) {
  const team = match[side];
  return <div className={`${css.fixtureTeam} ${css[side]}`}>
    <TeamCrest team={team} size={44} />
    <div><strong data-rival={team.id !== CLUB_ID || undefined}>{team.name}</strong><span>{side === "home" ? "Local" : "Visitante"}</span></div>
  </div>;
}

function History({ matches, target }: { matches: readonly TeamMatch[]; target: MatchSummary }) {
  const { recent, earlier } = preparationHistory(matches, target);
  const summary = preparationSummary(recent);
  return <div className={css.history}>
    <section aria-labelledby="home-recent-title">
      <h2 id="home-recent-title">Partidos recientes</h2>
      <p className={css.subtitle}>{recent.length ? `Últimos ${recent.length} partidos del rival` : "Todavía no hay partidos finalizados con fecha anterior al encuentro objetivo."}</p>
      {recent.length ? <>
        <dl className={css.summary} aria-label="Síntesis de partidos recientes">
          <div><dt>Forma</dt><dd><strong>{summary.wins}</strong> V · <strong>{summary.draws}</strong> E · <strong>{summary.losses}</strong> D</dd></div>
          <div><dt>Goles</dt><dd><SummaryValue label="GF" stat={summary.goalsFor} /><span aria-hidden="true"> · </span><SummaryValue label="GC" stat={summary.goalsAgainst} /></dd></div>
          <div><dt>Expectativa</dt><dd><SummaryValue label="xG" stat={summary.xg} decimals={2} /><span aria-hidden="true"> · </span><SummaryValue label="xG rival" stat={summary.opponentXg} decimals={2} /></dd></div>
        </dl>
        <PreparationMatches matches={recent} label="Partidos recientes del rival" />
      </> : null}
    </section>
    <section aria-labelledby="home-earlier-title">
      <h2 id="home-earlier-title">Partidos anteriores</h2><p className={css.subtitle}>Material complementario</p>
      {earlier.length ? <PreparationMatches matches={earlier} label="Partidos anteriores del rival" />
        : <p className={css.message}>No hay partidos anteriores adicionales.</p>}
    </section>
  </div>;
}

function SummaryValue({ label, stat, decimals = 0 }: { label: string; stat: SeasonStat; decimals?: number }) {
  const note = stat.value === null ? stat.reason === "not_collected" ? "Dato no recogido" : "Dato no disponible"
    : stat.coverage === "partial" ? `Datos disponibles en ${stat.matches} de ${stat.of} partidos` : undefined;
  return <span className={css.measure}><span className={css.reading}><strong title={note} aria-label={note}>
    {stat.value === null ? "—" : formatNumber(stat.value, decimals)}
    {stat.coverage === "partial" ? <sup aria-hidden="true">*</sup> : null}
  </strong> {label}</span>{stat.coverage === "partial" ? <span className={css.coverage}>{stat.matches}/{stat.of} partidos con dato</span> : null}</span>;
}

function PreparationMatches({ matches, label }: { matches: readonly TeamMatch[]; label: string }) {
  return <ul className={css.matches} aria-label={label}>
    {matches.map(({ match }) => <li key={match.id}>
      <Link className={css.match} href={`/matches/${encodeURIComponent(match.id)}`} prefetch={false}
        aria-label={`${match.home.name} contra ${match.away.name}, jornada ${match.round}, ${dateLabel(match.kickoff)}, ${match.score ? `${match.score.home}–${match.score.away}` : "resultado no disponible"}`}>
        <div className={css.meta}><strong>J{match.round}</strong><time dateTime={match.kickoff!}>{dateLabel(match.kickoff)}</time></div>
        <MatchTeam match={match} side="home" />
        <strong className={css.score}>{match.score ? `${match.score.home} – ${match.score.away}` : "—"}</strong>
        <MatchTeam match={match} side="away" />
      </Link>
    </li>)}
  </ul>;
}

function MatchTeam({ match, side }: { match: MatchSummary; side: "home" | "away" }) {
  return <span className={`${css.matchTeam} ${css[side]}`}><TeamCrest team={match[side]} size={28} />
    <span className={css.fullName}>{match[side].name}</span><span className={css.shortName}>{match[side].shortName}</span></span>;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className={css.error}><p>{message}</p><Button size="sm" onClick={retry}>Reintentar</Button></div>;
}
