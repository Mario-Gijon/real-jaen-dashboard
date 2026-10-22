"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ObservedMatchStatKey, ObservedPlayerMatch, ObservedPlayerMatches, PlayerPosition, Stat } from "@/contract";
import { Button } from "@/ui/Button";
import { dateLabel, positionLabel, statText } from "../format";
import { GoalIcon } from "../matches/GoalIcon";
import { AssistIcon } from "../matches/AssistIcon";
import { revealMatch } from "./PlayerMatches";
import shared from "./PlayerDetailView.module.css";
import css from "./PlayerMatches.module.css";

type Load = { data: ObservedPlayerMatches | null; error: unknown; retry: () => void };
type Metric = { key: ObservedMatchStatKey | "passAccuracy"; label: string; decimals?: number; percent?: boolean };

/**
 * The synthetic groups (player-metrics) with what the real source gives and
 * the app can interpret: no cards nor goals conceded (not in the source's
 * player statistics), plus goals, assists, xG and duels.
 */
const FIELD_GROUPS: readonly { title: string; metrics: readonly Metric[] }[] = [
  { title: "Finalización", metrics: [
    { key: "goals", label: "Goles" }, { key: "shots", label: "Tiros" },
    { key: "shotsOnTarget", label: "Tiros a puerta" }, { key: "xg", label: "xG", decimals: 2 },
  ] },
  { title: "Juego", metrics: [
    { key: "assists", label: "Asistencias" }, { key: "passes", label: "Pases" },
    { key: "passesCompleted", label: "Pases completados" }, { key: "passAccuracy", label: "Precisión de pase", percent: true },
    { key: "dribbles", label: "Regates" }, { key: "dribblesWon", label: "Regates ganados" },
  ] },
  { title: "Recuperación", metrics: [
    { key: "recoveries", label: "Recuperaciones" }, { key: "possessionLost", label: "Pérdidas" },
    { key: "duelsWon", label: "Duelos ganados" }, { key: "duelsLost", label: "Duelos perdidos" },
  ] },
  { title: "Disciplina", metrics: [{ key: "fouls", label: "Faltas" }] },
];
const KEEPER_GROUPS: typeof FIELD_GROUPS = [
  { title: "Portería", metrics: [{ key: "saves", label: "Paradas" }] },
];
const NOT_AVAILABLE: Stat = { value: null, reason: "not_available" };

/** Completed over attempted passes, only when both are known and some pass was attempted. */
function passAccuracy(stats: ObservedPlayerMatch["stats"]): Stat {
  const { passes, passesCompleted } = stats;
  if (passes.value === null || passesCompleted.value === null || passes.value === 0) return NOT_AVAILABLE;
  return { value: (passesCompleted.value / passes.value) * 100 };
}

/**
 * «Partidos» of a real player, laid out like the synthetic one: the
 * call-ups the source lists (newest first) on the left and the selected
 * match's individual detail on the right (inline under the row on phones).
 * Selecting a match never leaves the profile; `onSelect` lets the profile
 * keep it in the URL. A missing value reads «—», never 0; a call-up without
 * confirmed participation has no minutes nor stats and never reads «No
 * participó». `matchHref` (real matches active) adds «Ver partido completo».
 */
export function ObservedMatches({ load, usualPosition, initialMatchId = null, matchHref = null, onSelect }: {
  load: Load; usualPosition: PlayerPosition | null; initialMatchId?: string | null;
  matchHref?: ((matchId: string) => string) | null; onSelect?: (matchId: string) => void;
}) {
  const { data, error, retry } = load;
  const [selectedId, setSelectedId] = useState<string | null>(initialMatchId);
  const historyViewport = useRef<HTMLUListElement>(null);
  const initialMatch = useRef(initialMatchId);
  useEffect(() => {
    // Reveal the requested match once, inside the history viewport only.
    if (data && initialMatch.current) revealMatch(historyViewport.current, initialMatch.current);
    if (data) initialMatch.current = null;
  }, [data]);
  if (error) return <section className={shared.block} aria-labelledby="player-match-history">
    <h2 id="player-match-history">Partidos</h2>
    <div role="alert" className={shared.message}>
      <p>No se pudieron cargar los partidos observados.</p>
      <Button size="sm" onClick={retry}>Reintentar</Button>
    </div>
  </section>;
  if (!data) return <p role="status" className={shared.message}>Cargando partidos…</p>;

  const rows = data.matches;
  // An unknown selection selects nothing; without one, the newest confirmed appearance (else the newest call-up).
  const requested = selectedId === null ? null : rows.find(row => row.match.id === selectedId) ?? null;
  const selected = selectedId === null
    ? rows.find(row => row.participation === "confirmed") ?? rows[0] ?? null
    : requested;
  function select(matchId: string) {
    setSelectedId(matchId);
    onSelect?.(matchId);
  }
  return <div className={css.masterDetail}>
    <section className={`${shared.block} ${css.master}`} aria-labelledby="player-match-history">
      <h2 id="player-match-history">Partidos</h2>
      <p className={shared.coverageNote}>{data.scope}</p>
      {selectedId !== null && !requested ? <p role="status" className={shared.message}>
        El partido indicado no figura entre los partidos observados de este jugador.
      </p> : null}
      {!rows.length ? <p className={shared.message}>La fuente no tiene partidos observados de este jugador.</p> : null}
      <ul ref={historyViewport} className={css.history} aria-label="Histórico de partidos">
        {rows.map(row => {
          const active = selected?.match.id === row.match.id;
          return <li key={row.match.id}>
            <button type="button" className={css.historyRow} data-match-id={row.match.id}
              aria-pressed={active} aria-expanded={active} aria-controls={active ? "player-match-detail-panel player-inline-detail" : undefined}
              onClick={() => select(row.match.id)}>
              <HistoryRow row={row} />
            </button>
            {active ? <section id="player-inline-detail" className={css.inlineDetail} aria-label="Detalle inline del partido">
              <h3 className={css.detailHeading}>Detalle del partido</h3>
              <MatchDetail row={row} usualPosition={usualPosition} ratingSource={data.ratingSource} href={matchHref?.(row.match.id) ?? null} />
            </section> : null}
          </li>;
        })}
      </ul>
    </section>
    <section id="player-match-detail-panel" className={`${shared.block} ${css.desktopDetail}`} aria-labelledby="player-match-detail">
      <h2 id="player-match-detail">Detalle del partido</h2>
      {selected
        ? <MatchDetail row={selected} usualPosition={usualPosition} ratingSource={data.ratingSource} href={matchHref?.(selected.match.id) ?? null} />
        : <p className={shared.message}>{rows.length ? "Selecciona un partido del histórico." : "Sin partidos observados."}</p>}
    </section>
  </div>;
}

function MatchValue({ stat, decimals = 0, percent = false }: { stat: Stat; decimals?: number; percent?: boolean }) {
  if (stat.value === null) {
    const reason = stat.reason === "not_collected" ? "Dato no recogido" : "Dato no disponible";
    return <span className={shared.missing} title={reason} aria-label={reason}>—</span>;
  }
  return <>{statText(stat, percent ? 1 : decimals)}{percent ? " %" : null}</>;
}
function Score({ row }: { row: ObservedPlayerMatch }) {
  const { score } = row.match;
  return <span className={css.score} aria-label={score ? `Resultado local–visitante: ${score.home}–${score.away}` : "Resultado no disponible"}>
    {score ? `${score.home}–${score.away}` : "—"}
  </span>;
}
/** Role and minutes; a call-up without confirmed participation says so, never «No participó». */
function Role({ row }: { row: ObservedPlayerMatch }) {
  const role = row.role === "starter" ? "Titular" : row.role === "substitute" ? "Suplente" : "Rol no disponible";
  if (row.participation !== "confirmed") return <>{role} · Participación no confirmada</>;
  return <>{role} · <MatchValue stat={row.stats.minutes} />{row.stats.minutes.value !== null ? "′" : null}</>;
}
const teamName = (name: string | null) => name ?? "Equipo sin identificar";
const competitionLabel = ({ match }: ObservedPlayerMatch) => [match.competition, match.season].filter(Boolean).join(" · ");

function HistoryRow({ row }: { row: ObservedPlayerMatch }) {
  const { match } = row;
  const goals = row.stats.goals.value ?? 0;
  const assists = row.stats.assists.value ?? 0;
  const competition = competitionLabel(row);
  return <>
    <span className={css.round}>{match.round !== null ? `J${match.round}` : null}</span>
    <span className={css.fixture}>
      <span className={css.teams}>{teamName(match.home.name)} · {teamName(match.away.name)}</span>
      <span className={css.meta}>{row.side === "home" ? "Local" : "Visitante"} · {match.kickoff ? dateLabel(match.kickoff) : "Fecha por definir"}</span>
      {competition ? <span className={css.meta}>{competition}</span> : null}
    </span>
    <Score row={row} />
    <span className={css.playerContext}>
      <span className={css.role}><Role row={row} /></span>
      <span className={css.contribution}>
        {goals > 0 ? <span aria-label={`${goals} ${goals === 1 ? "gol" : "goles"}`}><GoalIcon />{goals > 1 ? goals : null}</span> : null}
        {assists > 0 ? <span aria-label={`${assists} ${assists === 1 ? "asistencia" : "asistencias"}`}><AssistIcon />{assists > 1 ? assists : null}</span> : null}
      </span>
    </span>
  </>;
}

function MatchDetail({ row, usualPosition, ratingSource, href }: {
  row: ObservedPlayerMatch; usualPosition: PlayerPosition | null; ratingSource: string; href: string | null;
}) {
  const { match } = row;
  const opponent = row.side === "home" ? match.away : match.home;
  const competition = competitionLabel(row);
  // The match position decides the metrics; the usual one only when the source does not give it.
  const keeper = (row.position ?? usualPosition) === "goalkeeper";
  return <>
    <div className={css.detailContext}>
      <p className={css.teams}>{match.round !== null ? `J${match.round} · ` : null}vs {teamName(opponent.name)} <Score row={row} /></p>
      <p className={css.meta}>{row.side === "home" ? "Local" : "Visitante"} · {match.kickoff ? dateLabel(match.kickoff) : "Fecha por definir"} · <Role row={row} /></p>
      {competition ? <p className={css.meta}>{competition}</p> : null}
      <p className={css.meta}>
        Posición en el partido: {row.position ? positionLabel(row.position) : "—"}
        {row.participation === "confirmed" ? <> · Valoración de {ratingSource}: <MatchValue stat={row.stats.rating} decimals={1} /></> : null}
      </p>
    </div>
    {row.participation === "confirmed" ? <div className={shared.performance}>
      {(keeper ? KEEPER_GROUPS : FIELD_GROUPS).map(group =>
        <section className={shared.group} key={group.title} aria-label={group.title}>
          <h3>{group.title}</h3>
          <dl className={shared.metrics}>{group.metrics.map(({ key, label, decimals, percent }) =>
            <div key={key}><dt>{label}</dt><dd>
              <MatchValue stat={key === "passAccuracy" ? passAccuracy(row.stats) : row.stats[key]} decimals={decimals} percent={percent} />
            </dd></div>)}</dl>
        </section>)}
    </div> : <p className={shared.message}>
      Convocado. La fuente no confirma su participación: sin minutos ni estadísticas individuales en este partido.
    </p>}
    {href ? <Link className={css.fullMatch} href={href} prefetch={false}>Ver partido completo</Link> : null}
  </>;
}
