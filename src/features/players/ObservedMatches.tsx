"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { House, LogOut } from "lucide-react";
import type { ObservedMatchStatKey, ObservedPlayerMatch, ObservedPlayerMatches, PlayerPosition, Stat } from "@/contract";
import { Button } from "@/ui/Button";
import { Select } from "@/ui/Select";
import { dateLabel, positionLabel, statText } from "../format";
import { revealMatch } from "./reveal-match";
import sections from "../teams/TeamPerformance.module.css";
import output from "../teams/TeamOutput.module.css";
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
const hasMinutes = (row: ObservedPlayerMatch) => row.participation !== "unknown" && row.stats.minutes.value !== null;

/** Completed over attempted passes, only when both are known and some pass was attempted. */
function passAccuracy(stats: ObservedPlayerMatch["stats"]): Stat {
  const { passes, passesCompleted } = stats;
  if (passes.value === null || passesCompleted.value === null || passes.value === 0) return NOT_AVAILABLE;
  return { value: (passesCompleted.value / passes.value) * 100 };
}

/**
 * «Partidos» of a real player: the recorded call-ups (newest first) in a
 * horizontal selector, with the selected match's individual detail below.
 * Selecting a match never leaves the profile; `onSelect` lets the profile
 * keep it in the URL. A missing value reads «—», never 0; a call-up without
 * confirmed participation has no minutes nor stats and never reads «No
 * participó»; an unused substitute reads «No utilizado». `matchHref` (real matches active) adds «Ver partido completo».
 */
export function ObservedMatches({ load, usualPosition, initialMatchId = null, matchHref = null, onSelect }: {
  load: Load; usualPosition: PlayerPosition | null; initialMatchId?: string | null;
  matchHref?: ((matchId: string) => string) | null; onSelect?: (matchId: string) => void;
}) {
  const { data, error, retry } = load;
  const [selectedId, setSelectedId] = useState<string | null>(initialMatchId);
  const historyViewport = useRef<HTMLUListElement>(null);
  const activeMatchId = selectedId ?? data?.matches.find(row => row.participation === "confirmed")?.match.id ?? data?.matches[0]?.match.id;
  useEffect(() => {
    // Reveal selection changes inside the strip, without moving the page.
    if (activeMatchId) revealMatch(historyViewport.current, activeMatchId, "horizontal");
  }, [data, activeMatchId]);
  if (error) return <section className={css.matchSelector} aria-labelledby="player-match-history">
    <h2 className={sections.zoneTitle} id="player-match-history">Partidos</h2>
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
  return <div className={css.observedLayout}>
    <section className={css.matchSelector} aria-labelledby="player-match-history">
      <div className={css.selectorHeading}>
        <h2 className={sections.zoneTitle} id="player-match-history">Partidos</h2>
        <div className={css.jump}>
          <Select aria-label="Ir a jornada" value={selected?.match.id ?? ""} disabled={!rows.length} onChange={(event) => select(event.target.value)}>
            {!selected ? <option value="" disabled>Selecciona un partido</option> : null}
            {rows.map(row => <option key={row.match.id} value={row.match.id}>{matchOption(row, rows)}</option>)}
          </Select>
        </div>
      </div>
      {selectedId !== null && !requested ? <p role="status" className={shared.message}>
        El partido indicado no figura entre los partidos observados de este jugador.
      </p> : null}
      {!rows.length ? <p className={shared.message}>La fuente no tiene partidos observados de este jugador.</p> : null}
      <ul ref={historyViewport} className={css.matchStrip} aria-label="Histórico de partidos">
        {rows.map(row => {
          const active = selected?.match.id === row.match.id;
          return <li key={row.match.id}>
            <button type="button" className={css.matchCard} data-match-id={row.match.id}
              aria-pressed={active} aria-controls="player-match-detail-panel"
              onClick={() => select(row.match.id)}>
              <span className={css.cardTop}>
                <span className={css.round}>{row.match.round !== null ? `J${row.match.round}` : "Sin jornada"}</span>
                {hasMinutes(row)
                  ? <span className={css.cardMinutes} aria-label={`${statText(row.stats.minutes)} minutos jugados`}><MatchValue stat={row.stats.minutes} />′</span> : null}
              </span>
              <span className={css.cardOpponent} title={opponentName(row)}>{opponentName(row)}</span>
              <span className={css.cardBottom}><Score row={row} /><Venue side={row.side} /></span>
            </button>
          </li>;
        })}
      </ul>
    </section>
    <section id="player-match-detail-panel" className={css.selectedDetail} aria-labelledby="player-match-detail">
      <h2 className={sections.zoneTitle} id="player-match-detail">Detalle del partido</h2>
      {selected
        ? <MatchDetail row={selected} usualPosition={usualPosition} href={matchHref?.(selected.match.id) ?? null} />
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
const teamName = (name: string | null) => name ?? "Equipo sin identificar";
const opponentName = (row: ObservedPlayerMatch) => teamName((row.side === "home" ? row.match.away : row.match.home).name);
function matchOption(row: ObservedPlayerMatch, rows: readonly ObservedPlayerMatch[]) {
  const label = `${row.match.round !== null ? `J${row.match.round}` : "Sin jornada"} · ${opponentName(row)}`;
  const repeated = rows.filter(other => other.match.round === row.match.round && opponentName(other) === opponentName(row));
  if (repeated.length === 1) return label;
  const date = row.match.kickoff ? dateLabel(row.match.kickoff) : "Fecha por definir";
  const sameDate = repeated.filter(other => (other.match.kickoff ? dateLabel(other.match.kickoff) : "Fecha por definir") === date);
  return `${label} · ${date}${sameDate.length > 1 ? ` · Encuentro ${sameDate.indexOf(row) + 1}` : ""}`;
}

function MetricValue({ metric, stats }: { metric: Metric; stats: ObservedPlayerMatch["stats"] }) {
  return <MatchValue stat={metric.key === "passAccuracy" ? passAccuracy(stats) : stats[metric.key]}
    decimals={metric.decimals} percent={metric.percent} />;
}

function Venue({ side }: { side: ObservedPlayerMatch["side"] }) {
  if (side !== "home" && side !== "away") return null;
  return <span className={css.venueIcon} role="img" aria-label={side === "home" ? "Local" : "Visitante"}>
    {side === "home" ? <House size={18} aria-hidden="true" /> : <LogOut size={18} aria-hidden="true" />}
  </span>;
}

function MatchDetail({ row, usualPosition, href }: {
  row: ObservedPlayerMatch; usualPosition: PlayerPosition | null; href: string | null;
}) {
  const { match } = row;
  const opponent = row.side === "home" ? match.away : match.home;
  // The match position decides the metrics; the usual one only when the source does not give it.
  const keeper = (row.position ?? usualPosition) === "goalkeeper";
  return <>
    <div className={css.detailContext}>
      <p className={css.detailFixture}>{match.round !== null ? <span>J{match.round} · </span> : null}{teamName(opponent.name)} · <Score row={row} /></p>
      <p className={css.meta}>{match.kickoff ? dateLabel(match.kickoff) : "Fecha por definir"}</p>
      <div className={css.playerBadges}>
        {row.side === "home" || row.side === "away" ? <span>{row.side === "home" ? "Local" : "Visitante"}</span> : null}
        {row.role ? <span>{row.role === "starter" ? "Titular" : "Suplente"}</span> : null}
        {hasMinutes(row) ? <span><MatchValue stat={row.stats.minutes} /> min</span> : null}
        {row.position ? <span>{positionLabel(row.position)}</span> : null}
      </div>
    </div>
    {row.participation === "confirmed" ? <div className={css.statGroups} data-keeper={keeper || undefined}>
      {(keeper ? [0] : [0, 1]).map(column => <div className={css.statColumn} key={column}>
        {(keeper ? KEEPER_GROUPS : FIELD_GROUPS).map((group, index) => index % 2 === column ? <section className={css.statBlock} style={{ order: index }} key={group.title} aria-label={group.title}>
          <h3 className={output.unitTitle}>{group.title}</h3>
          <dl className={css.statSecondary}>
            {group.metrics.map(metric => <div key={metric.key}>
              <dt>{metric.label}</dt><dd><MetricValue metric={metric} stats={row.stats} /></dd>
            </div>)}
          </dl>
        </section> : null)}
      </div>)}
    </div> : <p className={shared.message}>
      {row.participation === "unused"
        ? "Convocado, no utilizado: no entró en el partido."
        : "Convocado. Los datos no permiten confirmar su participación: sin minutos ni estadísticas individuales en este partido."}
    </p>}
    {href ? <Link className={css.fullMatch} href={href} prefetch={false}>Ver partido completo</Link> : null}
  </>;
}
