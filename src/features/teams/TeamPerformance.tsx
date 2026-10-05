"use client";

import { useState } from "react";
import type { MatchResult, TeamMatch, TeamSeason, TeamStatKey } from "@/contract";
import { TeamCrest } from "@/ui/TeamCrest";
import { dateLabel, formatNumber } from "../format";
import { SeasonValue } from "../SeasonValue";
import css from "./TeamPerformance.module.css";

const RESULT: Record<MatchResult, { letter: string; label: string }> = {
  win: { letter: "V", label: "Victoria" },
  draw: { letter: "E", label: "Empate" },
  loss: { letter: "D", label: "Derrota" },
};

/** Season stats shown, with their decimals; totals except possession (average). */
const STATS: readonly (readonly [TeamStatKey, string, number])[] = [
  ["possession", "Posesión media (%)", 1],
  ["shots", "Tiros", 0],
  ["shotsOnTarget", "Tiros a puerta", 0],
  ["xg", "xG", 2],
  ["corners", "Córners", 0],
  ["fouls", "Faltas", 0],
  ["yellowCards", "Amarillas", 0],
  ["redCards", "Rojas", 0],
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
 * «How is this team doing this season?»: the record, the sequence of results
 * and the finished matches. Only `status: finished` counts as played; the date
 * never decides it.
 */
export function TeamPerformance({ season }: { season: TeamSeason }) {
  const played = season.matches.filter((m) => m.match.status === "finished" && m.result);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = played.find((m) => m.match.id === activeId) ?? played[played.length - 1];
  const { record } = season.standing;
  const summary: [string, string, number][] = [
    ["PJ", "Partidos jugados", record.played],
    ["V", "Victorias", record.wins],
    ["E", "Empates", record.draws],
    ["D", "Derrotas", record.losses],
    ["GF", "Goles a favor", record.goalsFor],
    ["GC", "Goles en contra", record.goalsAgainst],
    ["Pts", "Puntos", record.points],
  ];
  const partial = STATS.some(([key]) => season.stats[key].coverage === "partial");

  return (
    <div className={css.performance}>
      <section aria-labelledby="team-summary">
        <h3 className={css.heading} id="team-summary">
          Resumen
          <span>{formatNumber(season.standing.rank)}.º en la clasificación</span>
        </h3>
        <dl className={css.summary}>
          {summary.map(([short, long, value]) => (
            <div data-kind={short} key={short}>
              <dt>
                <abbr title={long}>{short}</abbr>
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="team-form">
        <h3 className={css.heading} id="team-form">
          Evolución de resultados
        </h3>
        {played.length ? (
          <>
            <ol aria-label="Resultados por jornada" className={css.form}>
              {played.map((m) => {
                const { letter } = RESULT[m.result!];
                return (
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
                      <span className={css.letter}>{letter}</span>
                      <span className={css.round}>J{m.match.round}</span>
                    </button>
                  </li>
                );
              })}
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
          </>
        ) : (
          <p className={css.empty}>Todavía no ha disputado ningún partido.</p>
        )}
      </section>

      <section aria-labelledby="team-stats">
        <h3 className={css.heading} id="team-stats">
          Estadísticas de la temporada
        </h3>
        <dl className={css.stats}>
          {STATS.map(([key, label, decimals]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>
                <SeasonValue decimals={decimals} stat={season.stats[key]} />
              </dd>
            </div>
          ))}
        </dl>
        {partial ? (
          <p className={css.note}>
            <sup aria-hidden="true">*</sup> Total de los partidos con dato, no de toda la temporada.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="team-matches">
        <h3 className={css.heading} id="team-matches">
          Partidos disputados
        </h3>
        {played.length ? (
          <div className={css.scroll}>
            <table className={css.table}>
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
                {[...played].reverse().map((m) => (
                  // Prepared for /matches/[matchId] once that page exists.
                  <tr data-match-id={m.match.id} key={m.match.id}>
                    <td className={css.num}>{m.match.round}</td>
                    <td className={css.date}>
                      <DateCell kickoff={m.match.kickoff} />
                    </td>
                    <td className={css.venue}>{m.side === "home" ? "Local" : "Visitante"}</td>
                    <td className={css.rival}>
                      <span className={css.opponent}>
                        <span aria-hidden="true" className={css.venueShort}>
                          {m.side === "home" ? "vs" : "en"}
                        </span>
                        <TeamCrest size={22} team={m.opponent} />
                        <span className={css.opponentName}>{m.opponent.name}</span>
                      </span>
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
                  </tr>
                ))}
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
