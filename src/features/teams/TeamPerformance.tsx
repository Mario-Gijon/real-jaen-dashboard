"use client";
import Link from "next/link";
import { LinkedTableRow } from "@/ui/LinkedTableRow";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MatchResult, ObservedCompetitionPerformance, Side, TeamMatch, TeamRef, TeamSeason } from "@/contract";
import { TeamCrest } from "@/ui/TeamCrest";
import { dateLabel, formatNumber } from "../format";
import { observedCrest } from "../matches/ObservedMatchList";
import { average, finishedMatches, goalsAgainst, goalsFor, periodMatches, venueRecord, type Period, type VenueRecord } from "./performance";
import { TeamOutput } from "./TeamOutput";
import css from "./TeamPerformance.module.css";

const RESULT: Record<MatchResult, { letter: string; label: string }> = {
  win: { letter: "V", label: "Victoria" },
  draw: { letter: "E", label: "Empate" },
  loss: { letter: "D", label: "Derrota" },
};

const PERIODS: readonly (readonly [Period, string])[] = [
  ["season", "Temporada"],
  ["last3", "Últimos 3"],
];

/** A played match as the zones show it, whatever its source. */
type Played = {
  id: string;
  /** `null` when the source does not give the round. */
  round: number | null;
  kickoff: string | null;
  side: Side;
  opponent: TeamRef;
  result: MatchResult;
  goalsFor: number;
  goalsAgainst: number;
  /** Detail of the match, or `null` when there is none to open. */
  href: string | null;
};
/** Short label, long label and value of one balance item. */
type BalanceItem = [string, string, string | number];

/** Goals of the team first, as the result reads from its side. */
const teamScore = (m: Played) => `${m.goalsFor}-${m.goalsAgainst}`;

function resultLabel(played: Played): string {
  const { label } = RESULT[played.result];
  const venue = played.side === "home" ? "en casa contra" : "fuera contra";
  const round = played.round !== null ? `Jornada ${played.round}: ` : "";
  return `${round}${label} ${teamScore(played)} ${venue} ${played.opponent.name}`;
}

/** Date with the year hidden on phones, where the season makes it obvious. */
function DateCell({ kickoff }: { kickoff: string | null }) {
  const text = dateLabel(kickoff);
  const cut = text.lastIndexOf(" ");
  if (cut < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, cut)}
      <span className={css.year}>{text.slice(cut)}</span>
    </>
  );
}

function syntheticPlayed(m: TeamMatch): Played {
  return {
    id: m.match.id, round: m.match.round, kickoff: m.match.kickoff, side: m.side, opponent: m.opponent,
    result: m.result!, goalsFor: goalsFor(m), goalsAgainst: goalsAgainst(m), href: `/matches/${encodeURIComponent(m.match.id)}`,
  };
}

/**
 * «Rendimiento del equipo» in three zones that answer three questions:
 * TEMPORADA (how is the team doing), RENDIMIENTO (what it produces and
 * concedes, for the season or the last three matches) and PARTIDOS (which
 * matches explain it). Only `status: finished` counts as played.
 */
export function TeamPerformance({ season }: { season: TeamSeason }) {
  const finished = finishedMatches(season.matches);
  const played = finished.map(syntheticPlayed);
  const [period, setPeriod] = useState<Period>("season");
  const inPeriod = periodMatches(season.matches, period);
  const highlighted = new Set(period === "last3" ? inPeriod.map((m) => m.match.id) : []);
  const { record, rank } = season.standing;
  const balance: BalanceItem[] = [
    ["PJ", "Partidos jugados", record.played],
    ["V", "Victorias", record.wins],
    ["E", "Empates", record.draws],
    ["D", "Derrotas", record.losses],
    ["GF", "Goles a favor", record.goalsFor],
    ["GC", "Goles en contra", record.goalsAgainst],
  ];

  return (
    <div className={css.performance}>
      <SeasonZone balance={balance} lead={{ rank, points: record.points }} played={played} venues={venueRecord(season.matches)} />

      <OutputZone period={period} setPeriod={setPeriod}>
        {finished.length ? (
          <TeamOutput
            compare={period === "last3"}
            seasonValue={(indicator) => average(finished, indicator)}
            values={(indicator) => average(inPeriod, indicator)}
          />
        ) : (
          <p className={css.empty}>Sin partidos disputados.</p>
        )}
      </OutputZone>

      <PlayedZone highlighted={highlighted} played={played} />
    </div>
  );
}

/** «+4», «−1» or «0»: a plain difference, never good or bad. */
function signed(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}

/** RENDIMIENTO: its title, the period control and what it shows for that period. */
function OutputZone({ period, setPeriod, children }: { period: Period; setPeriod: (period: Period) => void; children: ReactNode }) {
  return (
    <section aria-labelledby="zone-output" className={css.zone}>
      <header className={css.zoneHeader}>
        <h3 className={css.zoneTitle} id="zone-output">
          Rendimiento
        </h3>
        <div aria-label="Periodo" className={css.periods} role="group">
          {PERIODS.map(([id, label]) => (
            <button
              aria-pressed={period === id}
              key={id}
              onClick={() => setPeriod(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      {children}
    </section>
  );
}

/**
 * The same zones with a real source's results: balance (with goal
 * difference), home and away, the result sequence, production and
 * concession (as computed by the source, for the season or «Últimos 3») and
 * the played matches. No table position nor points (there are no
 * standings). If the production figures could not be read, the rest stays.
 * `matchHref` opens the real match detail when real matches are enabled.
 */
export function RealTeamPerformance({ competition, matchHref }: {
  competition: ObservedCompetitionPerformance; matchHref: ((matchId: string) => string) | null;
}) {
  const { record, output } = competition;
  const [period, setPeriod] = useState<Period>("season");
  const highlighted = new Set(period === "last3" && output ? output.last3.matchIds : []);
  const played: Played[] = competition.results.map(({ match, side, result, goalsFor, goalsAgainst }) => ({
    id: match.id, round: match.round, kickoff: match.kickoff, side, result, goalsFor, goalsAgainst,
    opponent: { id: (side === "home" ? match.away : match.home).id, ...observedCrest(side === "home" ? match.away : match.home) },
    href: matchHref ? matchHref(match.id) : null,
  }));
  const balance: BalanceItem[] = [
    ["PJ", "Partidos jugados", record.played],
    ["V", "Victorias", record.wins],
    ["E", "Empates", record.draws],
    ["D", "Derrotas", record.losses],
    ["GF", "Goles a favor", record.goalsFor],
    ["GC", "Goles en contra", record.goalsAgainst],
    ["DG", "Diferencia de goles", signed(record.goalDifference)],
  ];
  if (!record.played) {
    return <div className={css.performance}>
      <p className={css.empty} role="status">Sin partidos finalizados observados en esta competición.</p>
    </div>;
  }
  return (
    <div className={css.performance}>
      <SeasonZone balance={balance} lead={null} played={played} venues={competition.venues} />
      <OutputZone period={period} setPeriod={setPeriod}>
        {output ? (
          <TeamOutput
            compare={period === "last3"}
            seasonValue={(indicator) => output.season[indicator]}
            values={(indicator) => (period === "last3" ? output.last3.values : output.season)[indicator]}
          />
        ) : (
          <p className={css.empty} role="status">No se pudieron leer la producción y la concesión de estos partidos.</p>
        )}
      </OutputZone>
      <PlayedZone highlighted={highlighted} played={played} />
    </div>
  );
}

/** PARTIDOS: the played matches, newest first, each opening its detail when there is one. */
function PlayedZone({ played, highlighted }: { played: readonly Played[]; highlighted: ReadonlySet<string> }) {
  return (
    <section aria-labelledby="zone-matches" className={css.zone}>
      <header className={css.zoneHeader}>
        <h3 className={css.zoneTitle} id="zone-matches">
          Partidos
        </h3>
      </header>
      {played.length ? (
        <div className={css.scroll}>
          <table aria-label="Partidos disputados" className={css.table}>
            <thead>
              <tr>
                <th scope="col">
                  <abbr title="Jornada">J</abbr>
                </th>
                <th scope="col">Fecha</th>
                <th className={css.venue} scope="col">
                  Condición
                </th>
                <th scope="col">Rival</th>
                <th className={css.end} scope="col">
                  Resultado
                </th>
              </tr>
            </thead>
            <tbody>
              {[...played].reverse().map((m) => {
                const marked = highlighted.has(m.id);
                const opponent = (
                  <>
                    <span aria-hidden="true" className={css.venueShort}>
                      {m.side === "home" ? "vs" : "en"}
                    </span>
                    <TeamCrest size={22} team={m.opponent} />
                    <span className={css.opponentName}>{m.opponent.name}</span>
                  </>
                );
                const Row = m.href ? LinkedTableRow : "tr";
                return (
                  <Row
                    data-in-period={marked || undefined}
                    data-linked={m.href ? undefined : "false"}
                    data-match-id={m.id}
                    key={m.id}
                  >
                    <td className={css.num}>
                      {m.round ?? "—"}
                      {marked ? <span className={css.sr}> (en «Últimos 3»)</span> : null}
                    </td>
                    <td className={css.date}>
                      <DateCell kickoff={m.kickoff} />
                    </td>
                    <td className={css.venue}>{m.side === "home" ? "Local" : "Visitante"}</td>
                    <td className={css.rival}>
                      {m.href ? (
                        <Link href={m.href} className={css.opponent} prefetch={false}>{opponent}</Link>
                      ) : (
                        <span className={css.opponent}>{opponent}</span>
                      )}
                    </td>
                    <td className={css.end}>
                      <span
                        aria-label={`${RESULT[m.result].label} ${teamScore(m)}`}
                        className={css.score}
                        data-result={m.result}
                      >
                        {RESULT[m.result].letter} {teamScore(m)}
                      </span>
                    </td>
                  </Row>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={css.empty}>Sin partidos disputados.</p>
      )}
    </section>
  );
}

/** TEMPORADA: table position and points (when there are standings), record, home/away split and the result sequence. */
function SeasonZone({ balance, lead, venues, played }: {
  balance: readonly BalanceItem[]; lead: { rank: number; points: number } | null; venues: VenueRecord; played: readonly Played[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // When the sequence overflows, start at its end: the latest results.
  const sequence = useRef<HTMLOListElement>(null);
  const lastId = played.at(-1)?.id;
  useEffect(() => {
    const list = sequence.current;
    if (list) list.scrollLeft = list.scrollWidth;
  }, [lastId]);
  const active = played.find((m) => m.id === activeId) ?? played[played.length - 1];

  return (
    <section aria-labelledby="zone-season" className={css.zone}>
      <header className={css.zoneHeader}>
        <h3 className={css.zoneTitle} id="zone-season">
          Temporada
        </h3>
      </header>
      <div className={css.standing}>
        {lead ? (
          <dl className={css.lead}>
            <div>
              <dt>Clasificación</dt>
              <dd>{formatNumber(lead.rank)}.º</dd>
            </div>
            <div>
              <dt>Puntos</dt>
              <dd>{lead.points}</dd>
            </div>
          </dl>
        ) : null}
        <dl aria-label="Balance" className={css.balance}>
          {balance.map(([short, long, value]) => (
            <div data-kind={short} key={short}>
              <dt>
                <abbr title={long}>{short}</abbr>
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <dl aria-label="Casa y fuera" className={css.venues}>
          {(["home", "away"] as const).map((side) => (
            <div key={side}>
              <dt>{side === "home" ? "Casa" : "Fuera"}</dt>
              <dd>
                {(["win", "draw", "loss"] as const).map((result) => (
                  <span data-result={result} key={result}>
                    <strong>{venues[side][result]}</strong>
                    <abbr title={`${RESULT[result].label}s`}>{RESULT[result].letter}</abbr>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {played.length ? (
        <div className={css.form}>
          <ol aria-label="Resultados por jornada" className={css.chips} ref={sequence}>
            {played.map((m) => (
              <li key={m.id}>
                <button
                  aria-label={resultLabel(m)}
                  aria-pressed={m === active}
                  className={css.chip}
                  data-result={m.result}
                  onClick={() => setActiveId(m.id)}
                  onFocus={() => setActiveId(m.id)}
                  onMouseEnter={() => setActiveId(m.id)}
                  title={resultLabel(m)}
                  type="button"
                >
                  <span className={css.letter}>{RESULT[m.result].letter}</span>
                </button>
              </li>
            ))}
          </ol>
          {active ? (
            <p aria-live="polite" className={css.detail}>
              {active.round !== null ? <span className={css.detailRound}>J{active.round}</span> : null}
              <span>{active.side === "home" ? "Local" : "Visitante"}</span>
              <TeamCrest size={20} team={active.opponent} />
              <strong>{active.opponent.name}</strong>
              <span className={css.score} data-result={active.result}>
                {RESULT[active.result].letter} {teamScore(active)}
              </span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className={css.empty}>Todavía no ha disputado ningún partido.</p>
      )}
    </section>
  );
}
