"use client";

import { useRouter } from "next/navigation";
import { getCompetitions, getSeasonMatches, getTeamSeason } from "@/client/api";
import type { MatchSummary, TeamMatch } from "@/contract";
import { CLUB_ID } from "../club";
import { homeHref, matchHref } from "@/lib/navigation";
import { useApi } from "../use-api";
import { daysUntil, preparationChoices, preparationHistory, preparationSummary, upcomingMatches } from "./preparation";
import { HistorySection, LoadError, TargetSection, type Fixture, type HistoryRow } from "./PreparationParts";
import css from "./HomeView.module.css";

/** What the «Inicio» URL asks for, and the server's clock. */
export type Props = { seasonId?: string; matchId?: string; now: number };

/** «Inicio» over the demonstration's season: its calendar, the chosen rival and its last matches. */
export function SyntheticHomeView({ seasonId, matchId, now }: Props) {
  const router = useRouter();
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

  return competitions.error ? <LoadError message="No se pudieron cargar las temporadas." retry={competitions.retry} />
    : !competitions.data ? <p role="status" className={css.message}>Cargando preparación…</p>
      : !season ? <p role="alert" className={css.message}>{seasonId ? "Temporada no encontrada." : "No hay temporadas disponibles."}</p>
        : calendar.error ? <LoadError message="No se pudo cargar el calendario del Real Jaén." retry={calendar.retry} />
          : !calendar.data ? <p role="status" className={css.message}>Cargando calendario…</p>
            : <>
              <TargetSection context={season.name} target={target ? fixture(target) : null}
                choices={preparationChoices(future, target).map(fixture)}
                onChoose={choice => router.push(homeHref({ seasonId: season.id, matchId: choice.id }), { scroll: false })}
                days={target ? daysUntil(target.kickoff, now) : null}
                analyze={rival ? { href: `/teams?${new URLSearchParams({ season: season.id, team: rival.id })}`, label: `Analizar ${rival.shortName}` } : null}
                empty={matchId ? { text: "El encuentro seleccionado no es un próximo partido válido del Real Jaén. Elige otro encuentro.", alert: true }
                  : { text: "No hay próximos encuentros con fecha disponible para preparar.", alert: false }} />
              {target && rival ? team.error ? <LoadError message="No se pudieron cargar los partidos del rival." retry={team.retry} />
                : team.data ? <SyntheticHistory team={rival.name} matches={team.data.matches} target={target} seasonId={season.id}
                  allHref={`/matches?${new URLSearchParams({ season: season.id, team: rival.id, round: "all" })}`} />
                  : <p role="status" className={css.message}>Cargando partidos del rival…</p> : null}
            </>;
}

const fixture = (match: MatchSummary): Fixture =>
  ({ id: match.id, round: match.round, kickoff: match.kickoff!, home: match.home, away: match.away });

function SyntheticHistory({ team, matches, target, seasonId, allHref }: {
  team: string; matches: readonly TeamMatch[]; target: MatchSummary; seasonId: string; allHref: string;
}) {
  const recent = preparationHistory(matches, target);
  const { xg, opponentXg, ...summary } = preparationSummary(recent);
  // A match opened from here returns to this season and target.
  const rows: HistoryRow[] = recent.map(({ match }) => ({ ...fixture(match), score: match.score,
    href: matchHref(match.id, { kind: "home", seasonId, matchId: target.id }) }));
  return <HistorySection team={team} rows={rows} summary={summary} expectation={{ xg, opponentXg }} allHref={allHref} />;
}
