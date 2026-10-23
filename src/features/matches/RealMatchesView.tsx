"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ApiRequestError, getTeamObservedMatches } from "@/client/api";
import type { ObservedMatch } from "@/contract";
import { Button } from "@/ui/Button";
import { PageHeader } from "@/ui/PageHeader";
import { ProvenanceNotice } from "@/ui/ProvenanceNotice";
import { Select } from "@/ui/Select";
import { CLUB_ID } from "../club";
import { useApi } from "../use-api";
import { ObservedMatchList } from "./ObservedMatchList";
import css from "./MatchesView.module.css";

type State = "all" | "finished" | "pending";
const isPending = (match: ObservedMatch) => match.status === "scheduled" || match.status === "postponed";

/** Distinct non-empty values, newest season first / alphabetical competitions. */
function options(values: (string | null)[], descending = false) {
  const unique = [...new Set(values.filter((v): v is string => v !== null))];
  return unique.sort((a, b) => (descending ? -1 : 1) * a.localeCompare(b, "es"));
}

/**
 * «Partidos» from the real source: the club's matches as the source lists
 * them, filtered by the source's own seasons, competitions and status. The
 * app's synthetic seasons and rounds play no part. A season or team from the
 * URL that has no correspondence is said so, never swapped for another. When
 * the source serves a single competition (its declared scope) there is
 * nothing to choose: the competition is named instead of offered.
 */
export function RealMatchesView({ initialSeasonId, initialTeamId }: { initialSeasonId?: string; initialTeamId?: string }) {
  const teamId = initialTeamId ?? CLUB_ID;
  // A season in the URL is one of the app's synthetic seasons: it cannot select real matches.
  const unmatchedSeason = initialSeasonId !== undefined;
  const load = useApi(unmatchedSeason ? null : `real-matches|${teamId}`, (signal) => getTeamObservedMatches(teamId, { signal }));
  const [season, setSeason] = useState("all");
  const [competition, setCompetition] = useState("all");
  const [state, setState] = useState<State>("all");
  const all = useMemo(() => load.data?.matches.map((row) => row.match) ?? [], [load.data]);
  const seasons = useMemo(() => options(all.map((m) => m.season), true), [all]);
  const competitions = useMemo(() => options(all.map((m) => m.competition)), [all]);
  const served = load.data?.competitions ?? null;
  const shown = all.filter((m) =>
    (season === "all" || m.season === season)
    && (competition === "all" || m.competition === competition)
    && (state === "all" || (state === "finished" ? m.status === "finished" : isPending(m))));
  const notFound = load.error instanceof ApiRequestError && load.error.code === "NOT_FOUND";
  const team = load.data?.matches[0]
    ? (load.data.matches[0].side === "home" ? load.data.matches[0].match.home : load.data.matches[0].match.away).name
    : null;

  return (
    <>
      <PageHeader
        title="Partidos"
        actions={
          <div className={css.scope}>
            {served && served.length === 1 ? (
              <p className={`${css.fixedTeam} ${css.competition}`}><span>Competición</span>{served[0].name}</p>
            ) : (
              <label className={`${css.field} ${css.competition}`}>
                <span>Competición</span>
                <Select disabled={!competitions.length} value={competition} onChange={(e) => setCompetition(e.target.value)}>
                  <option value="all">Todas las competiciones</option>
                  {competitions.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </label>
            )}
            <label className={`${css.field} ${css.season}`}>
              <span>Temporada</span>
              <Select disabled={!seasons.length} value={season} onChange={(e) => setSeason(e.target.value)}>
                <option value="all">Todas</option>
                {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </label>
          </div>
        }
      />
      <div className={css.explorer}>
        {unmatchedSeason || notFound ? (
          <div role="status" className={css.unmatched}>
            <p>
              {unmatchedSeason
                ? "La temporada seleccionada no corresponde a la fuente real de partidos: sus partidos se clasifican por las temporadas de la fuente."
                : "Este equipo no tiene correspondencia con la fuente real de partidos."}
            </p>
            <Link href="/matches">Ver los partidos reales del Real Jaén</Link>
          </div>
        ) : load.error ? (
          <div role="alert" className={css.error}>
            <p>No se pudieron cargar los partidos reales.</p>
            <Button size="sm" onClick={load.retry}>Reintentar</Button>
          </div>
        ) : !load.data ? (
          <p className={css.status} role="status">Cargando partidos…</p>
        ) : (
          <>
            <ProvenanceNotice source={load.data.source}><p>{load.data.scope}</p></ProvenanceNotice>
            <div className={css.filters}>
              <p className={css.fixedTeam}><span>Equipo</span>{team ?? "Real Jaén"}</p>
              <label className={`${css.field} ${css.teamPicker}`}>
                <span>Estado</span>
                <Select value={state} onChange={(e) => setState(e.target.value as State)}>
                  <option value="all">Todos</option>
                  <option value="finished">Finalizados</option>
                  <option value="pending">Pendientes</option>
                </Select>
              </label>
            </div>
            <section aria-label="Resultados de partidos" className={css.surface}>
              {all.length === 0 ? <p className={css.status} role="status">La fuente no tiene partidos de este equipo.</p>
                : shown.length === 0 ? <p className={css.status} role="status">No hay partidos con estos filtros.</p>
                : <ObservedMatchList matches={shown} />}
            </section>
          </>
        )}
      </div>
    </>
  );
}
