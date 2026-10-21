import type { ObservedPlayerMatch, ObservedPlayerMatches, Stat } from "@/contract";
import { Button } from "@/ui/Button";
import { MISSING, dateLabel, formatNumber } from "../format";
import shared from "./PlayerDetailView.module.css";
import css from "./ObservedMatches.module.css";

type Load = { data: ObservedPlayerMatches | null; error: unknown; retry: () => void };

/** Key, header, full name, decimals. */
const COLUMNS = [
  ["minutes", "Min", "Minutos", 0],
  ["goals", "G", "Goles", 0],
  ["assists", "A", "Asistencias", 0],
  ["shots", "Tiros", "Tiros", 0],
  ["xg", "xG", "Goles esperados (xG)", 2],
] as const;

/**
 * «Partidos observados» of a real player: call-ups as the source lists them,
 * newest first, with the season and competition each one belongs to. A
 * missing value reads «—», never 0; without confirmed participation there are
 * no minutes nor stats, and nothing claims the player did not play. Its own
 * error and retry leave the rest of the profile in place.
 */
export function ObservedMatches({ load }: { load: Load }) {
  const { data, error, retry } = load;
  return <section aria-labelledby="observed-matches" className={css.section}>
    <h2 id="observed-matches">
      Partidos observados{data?.matches.length ? <span className={css.count}> {data.matches.length}</span> : null}
    </h2>
    {error ? <div role="alert" className={shared.message}>
      <p>No se pudieron cargar los partidos observados.</p>
      <Button size="sm" onClick={retry}>Reintentar</Button>
    </div>
      : !data ? <p role="status" className={shared.message}>Cargando partidos…</p>
      : <>
        <p className={css.scope}>{data.scope}</p>
        {data.matches.length === 0
          ? <p className={shared.message}>La fuente no tiene partidos observados de este jugador.</p>
          : <div className={css.scroll}>
            <table className={css.table}>
              <caption className={css.sr}>Partidos observados del jugador</caption>
              <thead>
                <tr>
                  <th scope="col" className={css.match}>Partido</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Rol</th>
                  {COLUMNS.map(([key, short, long]) => <th scope="col" className={css.num} key={key}>
                    <abbr title={long}>{short}</abbr>
                  </th>)}
                  <th scope="col" className={css.num}><abbr title="Pases completados / intentados">Pases</abbr></th>
                  <th scope="col" className={css.num}>
                    <abbr title={`Valoración de ${data.ratingSource}`}>Val. {data.ratingSource}</abbr>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.matches.map(row => <MatchRow key={row.match.id} row={row} />)}
              </tbody>
            </table>
          </div>}
      </>}
  </section>;
}

function MatchRow({ row }: { row: ObservedPlayerMatch }) {
  const { match, side, role, participation, stats } = row;
  const opponent = side === "home" ? match.away : match.home;
  const seasonRound = [match.season, match.round !== null ? `J${match.round}` : null].filter(Boolean).join(" · ");
  return <tr data-participation={participation}>
    <th scope="row" className={css.match}>
      <span className={css.opponent}>vs {opponent.name ?? "Rival sin identificar"}</span>
      <span className={`${css.meta} ${css.when}`}>{dateLabel(match.kickoff)} · {side === "home" ? "Local" : "Visitante"}</span>
      {match.competition || seasonRound ? <span className={css.meta}>
        {match.competition ? <span>{match.competition}</span> : null}
        {match.competition && seasonRound ? <span className={css.separator}> · </span> : null}
        {seasonRound ? <span className={css.seasonRound}>{seasonRound}</span> : null}
      </span> : null}
    </th>
    <td>
      <span aria-label={match.score ? `Resultado local–visitante: ${match.score.home}–${match.score.away}` : "Resultado no disponible"}>
        {match.score ? `${match.score.home}–${match.score.away}` : MISSING}
      </span>
    </td>
    <td>
      {role === "starter" ? "Titular" : role === "substitute" ? "Suplente" : MISSING}
      {participation === "unknown" ? <span className={css.meta}>Participación no confirmada</span> : null}
    </td>
    {COLUMNS.map(([key, , , decimals]) => <td className={css.num} key={key}><Value stat={stats[key]} decimals={decimals} /></td>)}
    <td className={css.num}><Value stat={stats.passesCompleted} />/<Value stat={stats.passes} /></td>
    <td className={css.num}><Value stat={stats.rating} decimals={1} /></td>
  </tr>;
}

function Value({ stat, decimals = 0 }: { stat: Stat; decimals?: number }) {
  if (stat.value === null) {
    const reason = stat.reason === "not_collected" ? "Dato no recogido" : "Dato no disponible";
    return <span className={shared.missing} title={reason} aria-label={reason}>{MISSING}</span>;
  }
  return <>{formatNumber(stat.value, decimals)}</>;
}
