"use client";
import Link from "next/link";
import { LinkedTableRow } from "@/ui/LinkedTableRow";

import { useEffect, useRef, useState } from "react";
import type { MatchResult, TeamMatch, TeamSeason } from "@/contract";
import { TeamCrest } from "@/ui/TeamCrest";
import { dateLabel, formatNumber } from "../format";
import { finishedMatches, periodMatches, venueRecord, type Period } from "./performance";
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

/** Goals of the team first, as the result reads from its side. */
function teamScore({ match, side }: TeamMatch): string {
  const { home, away } = match.score!;
  return side === "home" ? `${home}-${away}` : `${away}-${home}`;
}

function resultLabel(played: TeamMatch): string {
  const { label } = RESULT[played.result!];
  const venue = played.side === "home" ? "en casa contra" : "fuera contra";
  return `Jornada ${played.match.round}: ${label} ${teamScore(played)} ${venue} ${played.opponent.name}`;
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

/**
 * «Rendimiento del equipo» in three zones that answer three questions:
 * TEMPORADA (how is the team doing), RENDIMIENTO (what it produces and
 * concedes, for the season or the last three matches) and PARTIDOS (which
 * matches explain it). Only `status: finished` counts as played.
 */
export function TeamPerformance({ season }: { season: TeamSeason }) {
  const played = finishedMatches(season.matches);
  const [period, setPeriod] = useState<Period>("season");
  const inPeriod = periodMatches(season.matches, period);
  const highlighted = new Set(period === "last3" ? inPeriod.map((m) => m.match.id) : []);

  return (
    <div className={css.performance}>
      <SeasonZone played={played} season={season} />

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
        {played.length ? (
          <TeamOutput period={period} periodMatches={inPeriod} seasonMatches={played} />
        ) : (
          <p className={css.empty}>Sin partidos disputados.</p>
        )}
      </section>

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
                  const marked = highlighted.has(m.match.id);
                  return (
                    <LinkedTableRow
                      data-in-period={marked || undefined}
                      data-match-id={m.match.id}
                      key={m.match.id}
                    >
                      <td className={css.num}>
                        {m.match.round}
                        {marked ? <span className={css.sr}> (en «Últimos 3»)</span> : null}
                      </td>
                      <td className={css.date}>
                        <DateCell kickoff={m.match.kickoff} />
                      </td>
                      <td className={css.venue}>{m.side === "home" ? "Local" : "Visitante"}</td>
                      <td className={css.rival}>
                        <Link href={`/matches/${encodeURIComponent(m.match.id)}`} className={css.opponent} prefetch={false}>
                          <span aria-hidden="true" className={css.venueShort}>
                            {m.side === "home" ? "vs" : "en"}
                          </span>
                          <TeamCrest size={22} team={m.opponent} />
                          <span className={css.opponentName}>{m.opponent.name}</span>
                        </Link>
                      </td>
                      <td className={css.end}>
                        <span
                          aria-label={`${RESULT[m.result!].label} ${teamScore(m)}`}
                          className={css.score}
                          data-result={m.result}
                        >
                          {RESULT[m.result!].letter} {teamScore(m)}
                        </span>
                      </td>
                    </LinkedTableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={css.empty}>Sin partidos disputados.</p>
        )}
      </section>
    </div>
  );
}

/** TEMPORADA: table position and record, home/away split and the result sequence. */
function SeasonZone({ season, played }: { season: TeamSeason; played: readonly TeamMatch[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // When the sequence overflows, start at its end: the latest results.
  const sequence = useRef<HTMLOListElement>(null);
  const lastId = played.at(-1)?.match.id;
  useEffect(() => {
    const list = sequence.current;
    if (list) list.scrollLeft = list.scrollWidth;
  }, [lastId]);
  const active = played.find((m) => m.match.id === activeId) ?? played[played.length - 1];
  const { record, rank } = season.standing;
  const venues = venueRecord(season.matches);
  const balance: [string, string, number][] = [
    ["PJ", "Partidos jugados", record.played],
    ["V", "Victorias", record.wins],
    ["E", "Empates", record.draws],
    ["D", "Derrotas", record.losses],
    ["GF", "Goles a favor", record.goalsFor],
    ["GC", "Goles en contra", record.goalsAgainst],
  ];

  return (
    <section aria-labelledby="zone-season" className={css.zone}>
      <header className={css.zoneHeader}>
        <h3 className={css.zoneTitle} id="zone-season">
          Temporada
        </h3>
      </header>
      <div className={css.standing}>
        <dl className={css.lead}>
          <div>
            <dt>Clasificación</dt>
            <dd>{formatNumber(rank)}.º</dd>
          </div>
          <div>
            <dt>Puntos</dt>
            <dd>{record.points}</dd>
          </div>
        </dl>
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
              <li key={m.match.id}>
                <button
                  aria-label={resultLabel(m)}
                  aria-pressed={m === active}
                  className={css.chip}
                  data-result={m.result}
                  onClick={() => setActiveId(m.match.id)}
                  onFocus={() => setActiveId(m.match.id)}
                  onMouseEnter={() => setActiveId(m.match.id)}
                  title={resultLabel(m)}
                  type="button"
                >
                  <span className={css.letter}>{RESULT[m.result!].letter}</span>
                </button>
              </li>
            ))}
          </ol>
          {active ? (
            <p aria-live="polite" className={css.detail}>
              <span className={css.detailRound}>J{active.match.round}</span>
              <span>{active.side === "home" ? "Local" : "Visitante"}</span>
              <TeamCrest size={20} team={active.opponent} />
              <strong>{active.opponent.name}</strong>
              <span className={css.score} data-result={active.result}>
                {RESULT[active.result!].letter} {teamScore(active)}
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
