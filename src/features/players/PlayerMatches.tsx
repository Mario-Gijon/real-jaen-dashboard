"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { getSeasonMatches } from "@/client/api";
import type { MatchEvent, MatchSummary, PlayerMatch, PlayerSeason, Stat } from "@/contract";
import { Button } from "@/ui/Button";
import { dateLabel, statText } from "../format";
import { useApi } from "../use-api";
import { GoalIcon } from "../matches/GoalIcon";
import { AssistIcon } from "../matches/AssistIcon";
import { FIELD_GROUPS, KEEPER_GROUPS } from "./player-metrics";
import shared from "./PlayerDetailView.module.css";
import css from "./PlayerMatches.module.css";

/** `initialMatchId` comes from navigation (e.g. a match context); it is selected only if it is a finished team match. */
export function PlayerMatches({ data, initialMatchId = null }: { data: PlayerSeason; initialMatchId?: string | null }) {
  const calendar = useApi(`player-calendar|${data.season.id}|${data.team.id}`,
    signal => getSeasonMatches(data.season.id, { teamId: data.team.id }, { signal }));
  const [selectedId, setSelectedId] = useState<string | null>(initialMatchId);
  const sequenceViewport = useRef<HTMLDivElement>(null);
  const historyViewport = useRef<HTMLUListElement>(null);
  const initialMatch = useRef(initialMatchId);
  useEffect(() => {
    if (sequenceViewport.current) sequenceViewport.current.scrollLeft = 0;
    // Reveal the requested match once, inside the history and sequence viewports only.
    if (calendar.data && initialMatch.current) revealMatch(historyViewport.current, sequenceViewport.current, initialMatch.current, true);
    if (calendar.data) initialMatch.current = null;
  }, [calendar.data]);
  function selectMatch(matchId: string, fromParticipation = false) {
    setSelectedId(matchId);
    revealMatch(historyViewport.current, sequenceViewport.current, matchId, fromParticipation);
  }
  if (calendar.error) return <div role="alert" className={shared.message}>
    <p>No se pudo cargar el calendario del equipo.</p><Button size="sm" onClick={calendar.retry}>Reintentar</Button>
  </div>;
  if (!calendar.data) return <p role="status" className={shared.message}>Cargando partidos…</p>;
  const matches = calendar.data.filter(match => match.status === "finished")
    .sort((a, b) => (a.kickoff && b.kickoff ? a.kickoff.localeCompare(b.kickoff) : 0) || a.round - b.round);
  const appearances = new Map(data.matches.map(appearance => [appearance.match.id, appearance]));
  const recent = [...matches].reverse();
  // An explicit selection may be a match without appearance; an unknown one selects nothing.
  const requested = selectedId === null ? null : matches.find(match => match.id === selectedId) ?? null;
  const selected = selectedId === null
    ? recent.map(match => appearances.get(match.id)).find(appearance => appearance !== undefined)
    : requested ? appearances.get(requested.id) : undefined;
  const absent = requested && !selected ? requested : null;
  const selectedMatchId = selected?.match.id ?? absent?.id ?? null;
  return <>
    <section className={shared.block} aria-labelledby="player-match-participation">
      <h2 id="player-match-participation">Participación</h2>
      {matches.length ? <>
        <div ref={sequenceViewport} className={css.sequenceViewport} tabIndex={0} role="region" aria-label="Secuencia de participación por partido">
          <ol className={css.sequence}>
            {matches.map(match => {
              const appearance = appearances.get(match.id);
              const role = appearance ? appearance.started ? "Titular" : "Suplente" : "No participó";
              const content = <>
                <span className={css.round}>J{match.round}</span>
                <span className={css.sequenceMinutes}>{appearance ? <MatchValue stat={appearance.stats.minutes} /> : "—"}</span>
                <span className={css.sequenceRole}>{role}</span>
              </>;
              return <li key={match.id} data-match-id={match.id} data-role={appearance ? appearance.started ? "starter" : "substitute" : "absent"}
                aria-label={`Jornada ${match.round} · ${role}${appearance ? ` · ${minutesLabel(appearance.stats.minutes)}` : ""}`}>
                {appearance ? <button type="button" className={css.sequenceButton}
                  aria-label={`Jornada ${match.round} · ${role} · ${minutesLabel(appearance.stats.minutes)}`}
                  aria-pressed={selected?.match.id === match.id} onClick={() => selectMatch(match.id, true)}>{content}</button>
                  : <div className={css.sequenceUnit} aria-current={absent?.id === match.id || undefined}>{content}</div>}
              </li>;
            })}
          </ol>
        </div>
      </> : <p className={shared.message}>Todavía no hay partidos finalizados del equipo.</p>}
    </section>
    <div className={css.masterDetail}>
    <section className={`${shared.block} ${css.master}`} aria-labelledby="player-match-history">
      <h2 id="player-match-history">Partidos</h2>
      {selectedId !== null && !requested ? <p role="status" className={shared.message}>
        El partido indicado no figura entre los partidos finalizados de {data.team.name} en {data.season.name}.
      </p> : null}
      <ul ref={historyViewport} className={css.history} aria-label="Histórico de partidos">
        {recent.map(match => {
          const appearance = appearances.get(match.id);
          const active = selectedMatchId === match.id;
          const content = <HistoryRow match={match} appearance={appearance} data={data} />;
          return <li key={match.id}>{appearance ? <button type="button" className={css.historyRow} data-match-id={match.id}
            aria-pressed={active} aria-expanded={active} aria-controls={active ? "player-match-detail-panel player-inline-detail" : undefined}
            onClick={() => selectMatch(match.id)}>
            {content}
          </button> : <div className={css.historyRow} data-match-id={match.id} aria-current={active || undefined}>{content}</div>}
            {active ? <section id="player-inline-detail" className={css.inlineDetail} aria-label="Detalle inline del partido">
              <h3 className={css.detailHeading}>Detalle del partido</h3>
              {appearance ? <AppearanceDetail appearance={appearance} data={data} /> : <AbsentDetail match={match} data={data} />}
            </section> : null}
          </li>;
        })}
      </ul>
    </section>
    <section id="player-match-detail-panel" className={`${shared.block} ${css.desktopDetail}`} aria-labelledby="player-match-detail">
      <h2 id="player-match-detail">Detalle del partido</h2>
      {selected ? <AppearanceDetail appearance={selected} data={data} />
        : absent ? <AbsentDetail match={absent} data={data} />
        : <p className={shared.message}>{selectedId !== null && data.matches.length ? "Selecciona un partido del histórico." : "Sin apariciones esta temporada."}</p>}
    </section>
    </div>
  </>;
}

/** Moves only the history and sequence viewports, never the page. */
function revealMatch(history: HTMLElement | null, viewport: HTMLElement | null, matchId: string, inHistory: boolean) {
  if (inHistory) {
    const row = history && [...history.querySelectorAll<HTMLElement>("[data-match-id]")]
      .find(element => element.dataset.matchId === matchId);
    if (history && row && history.scrollHeight > history.clientHeight) {
      const bounds = history.getBoundingClientRect();
      const rowBounds = row.getBoundingClientRect();
      const visibleTop = Math.max(bounds.top, 0);
      const visibleBottom = Math.min(bounds.bottom, document.documentElement.clientHeight);
      const top = visibleBottom > visibleTop ? visibleTop : bounds.top;
      const bottom = visibleBottom > visibleTop ? visibleBottom : bounds.bottom;
      if (rowBounds.top < top) history.scrollTop += rowBounds.top - top;
      else if (rowBounds.bottom > bottom) history.scrollTop += rowBounds.bottom - bottom;
    }
  }
  const item = viewport && [...viewport.querySelectorAll<HTMLElement>("[data-match-id]")]
    .find(element => element.dataset.matchId === matchId);
  if (!viewport || !item) return;
  const bounds = viewport.getBoundingClientRect();
  const itemBounds = item.getBoundingClientRect();
  // Move only this horizontal viewport; never scroll the page or detail into view.
  if (itemBounds.left < bounds.left) viewport.scrollLeft += itemBounds.left - bounds.left;
  else if (itemBounds.right > bounds.right) viewport.scrollLeft += itemBounds.right - bounds.right;
}

function minutesLabel(stat: Stat) {
  return stat.value === null ? "Minutos sin datos" : `${stat.value} minutos`;
}
function MatchValue({ stat, percent = false }: { stat: Stat; percent?: boolean }) {
  if (stat.value === null) {
    const reason = stat.reason === "not_collected" ? "Dato no recogido" : "Dato no disponible";
    return <span className={shared.missing} title={reason} aria-label={reason}>—</span>;
  }
  return <>{statText(stat, percent ? 1 : 0)}{percent ? " %" : null}</>;
}
function Score({ match }: { match: MatchSummary }) {
  return <span className={css.score} aria-label={match.score ? `Resultado local–visitante: ${match.score.home}–${match.score.away}` : "Resultado no disponible"}>
    {match.score ? `${match.score.home}–${match.score.away}` : "—"}
  </span>;
}
function HistoryRow({ match, appearance, data }: { match: MatchSummary; appearance?: PlayerMatch; data: PlayerSeason }) {
  const side = match.home.id === data.team.id ? "Local" : "Visitante";
  const goals = appearance?.events.filter(event => event.type === "goal" && event.player.id === data.player.id && !event.ownGoal).length ?? 0;
  const assists = appearance?.events.filter(event => event.type === "goal" && event.assist?.id === data.player.id).length ?? 0;
  return <>
    <span className={css.round}>J{match.round}</span>
    <span className={css.fixture}>
      <span className={css.teams}>{match.home.name} · {match.away.name}</span>
      <span className={css.meta}>{side} · {dateLabel(match.kickoff)}</span>
    </span>
    <Score match={match} />
    <span className={css.playerContext}>
    <span className={css.role}>{appearance ? <>{appearance.started ? "Titular" : "Suplente"} · <MatchValue stat={appearance.stats.minutes} />{appearance.stats.minutes.value !== null ? "′" : null}</> : "No participó"}</span>
    <span className={css.contribution}>
      {goals > 0 ? <span aria-label={`${goals} ${goals === 1 ? "gol" : "goles"}`}><GoalIcon />{goals > 1 ? goals : null}</span> : null}
      {assists > 0 ? <span aria-label={`${assists} ${assists === 1 ? "asistencia" : "asistencias"}`}><AssistIcon />{assists > 1 ? assists : null}</span> : null}
    </span>
    </span>
  </>;
}

function AppearanceDetail({ appearance, data }: { appearance: PlayerMatch; data: PlayerSeason }) {
  const { match } = appearance;
  const opponent = appearance.side === "home" ? match.away : match.home;
  const events = appearance.events.filter(event => event.type === "goal"
    ? event.player.id === data.player.id || event.assist?.id === data.player.id
    : event.type === "card" ? event.player.id === data.player.id
      : event.playerIn.id === data.player.id || event.playerOut.id === data.player.id)
    .slice().sort((a, b) => a.minute - b.minute || (a.addedTime ?? 0) - (b.addedTime ?? 0));
  return <>
    <div className={css.detailContext}>
      <p className={css.teams}>J{match.round} · vs {opponent.name} <Score match={match} /></p>
      <p className={css.meta}>{appearance.side === "home" ? "Local" : "Visitante"} · {dateLabel(match.kickoff)} · {appearance.started ? "Titular" : "Suplente"} · <MatchValue stat={appearance.stats.minutes} />{appearance.stats.minutes.value !== null ? "′" : null}</p>
    </div>
    <div className={shared.performance}>
      {(data.player.position === "goalkeeper" ? KEEPER_GROUPS : FIELD_GROUPS).map(group =>
        <section className={shared.group} key={group.title} aria-label={group.title}>
          <h3>{group.title}</h3>
          <dl className={shared.metrics}>{group.metrics.map(({ key, label, percent }) =>
            <div key={key}><dt>{label}</dt><dd><MatchValue stat={appearance.stats[key]} percent={percent} /></dd></div>)}</dl>
        </section>)}
    </div>
    <section className={css.actionsBlock} aria-label="Acciones">
      <h3>Acciones</h3>
      {events.length ? <ol className={css.actions} aria-label="Acciones del jugador en el partido">
        {events.map(event => <li key={event.id}>
          <span className={css.minute}>{event.minute}{event.addedTime ? `+${event.addedTime}` : ""}′</span>
          <PlayerAction event={event} playerId={data.player.id} />
        </li>)}
      </ol> : <p className={shared.message}>Sin acciones registradas en este partido.</p>}
    </section>
    <Link className={css.fullMatch} href={`/matches/${match.id}`}>Ver partido completo</Link>
  </>;
}
/** A team match the player did not play: context only, no minutes or stats, and no assumed reason. */
function AbsentDetail({ match, data }: { match: MatchSummary; data: PlayerSeason }) {
  const home = match.home.id === data.team.id;
  return <>
    <div className={css.detailContext}>
      <p className={css.teams}>J{match.round} · vs {(home ? match.away : match.home).name} <Score match={match} /></p>
      <p className={css.meta}>{home ? "Local" : "Visitante"} · {dateLabel(match.kickoff)} · No participó</p>
    </div>
    <p className={shared.message}>Sin minutos ni estadísticas individuales en este partido.</p>
    <Link className={css.fullMatch} href={`/matches/${match.id}`}>Ver partido completo</Link>
  </>;
}
function PlayerAction({ event, playerId }: { event: MatchEvent; playerId: string }) {
  if (event.type === "goal") {
    const assist = event.assist?.id === playerId && event.player.id !== playerId;
    return <span className={css.actionText}>
      {assist ? <AssistIcon /> : <GoalIcon />}
      <span>{assist ? `Asistencia · Gol de ${event.player.name}` : event.ownGoal ? "Gol en propia puerta" : event.penalty ? "Gol · Penalti" : "Gol"}
        {assist ? <span className={css.meta}>Minuto del gol asistido</span> : null}</span>
    </span>;
  }
  if (event.type === "card") return <span className={css.actionText}>
    <span className={css.cardIcon} data-card={event.card} aria-hidden="true"><span />{event.card === "second_yellow" ? <span /> : null}</span>
    <span>{event.card === "yellow" ? "Amarilla" : event.card === "second_yellow" ? "Segunda amarilla" : "Roja"}</span>
  </span>;
  const enters = event.playerIn.id === playerId;
  return <span className={css.actionText}>{enters ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />}
    <span>{enters ? "Entra" : "Sale"}</span></span>;
}
