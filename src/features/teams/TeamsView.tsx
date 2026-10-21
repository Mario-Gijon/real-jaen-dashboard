"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ApiRequestError, getCompetitions, getObservedPlayers, getSeasonTeams, getTeamSeason } from "@/client/api";
import type { TeamRef } from "@/contract";
import { Button } from "@/ui/Button";
import { PageHeader } from "@/ui/PageHeader";
import { Select } from "@/ui/Select";
import { TeamCrest } from "@/ui/TeamCrest";
import { tabId, tabPanelId, Tabs } from "@/ui/Tabs";
import { useApi } from "../use-api";
import { ObservedPlayersList } from "./ObservedPlayersList";
import { TeamCrestGrid } from "./TeamCrestGrid";
import { TeamPerformance } from "./TeamPerformance";
import { TeamPlayersTable } from "./TeamPlayersTable";
import css from "./TeamsView.module.css";

/** The analyst's club: selected by default and first in the grid. */
export const CLUB_TEAM_ID = "team-real-jaen";

type Tab = "performance" | "players";
const TABS = [
  { id: "performance", label: "Rendimiento del equipo" },
  { id: "players", label: "Jugadores" },
] as const;
const TABS_PREFIX = "team";
/** Same breakpoint as the phone layout in TeamsView.module.css. */
const PHONE = "(max-width: 640px)";

/** Club first, then alphabetical: quick to scan for a name. */
function gridOrder(teams: readonly TeamRef[]): TeamRef[] {
  return [...teams].sort(
    (a, b) =>
      Number(b.id === CLUB_TEAM_ID) - Number(a.id === CLUB_TEAM_ID) ||
      a.shortName.localeCompare(b.shortName, "es"),
  );
}

/**
 * «Equipos»: one club's whole season. Competition and season pick the teams,
 * a crest grid picks the club (folded on phones once chosen) and two tabs show
 * its collective performance and its squad. Everything comes from `/api/v1`
 * through the typed client.
 */
export function TeamsView({ initialTeamId, initialSeasonId, initialTab = "performance" }: {
  initialTeamId?: string; initialSeasonId?: string; initialTab?: Tab;
}) {
  const competitions = useApi("competitions", (signal) => getCompetitions({ signal }));
  const [competitionId, setCompetitionId] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(initialSeasonId ?? null);
  const competition =
    competitions.data?.find((c) => c.id === competitionId) ?? competitions.data?.find(c => c.seasons.some(s => s.id === seasonId)) ?? competitions.data?.[0] ?? null;
  const season =
    competition?.seasons.find((s) => s.id === seasonId) ?? competition?.seasons[0] ?? null;

  const standings = useApi(season && `teams|${season.id}`, (signal) =>
    getSeasonTeams(season!.id, { signal }),
  );
  const teams = useMemo(
    () => gridOrder(standings.data?.map((row) => row.team) ?? []),
    [standings.data],
  );
  const [teamId, setTeamId] = useState<string | null>(initialTeamId ?? null);
  const team =
    teams.find((t) => t.id === teamId) ??
    teams.find((t) => t.id === CLUB_TEAM_ID) ??
    teams[0] ??
    null;

  const detail = useApi(season && team && `team|${season.id}|${team.id}`, (signal) =>
    getTeamSeason(season!.id, team!.id, { signal }),
  );
  const [tab, setTab] = useState<Tab>(initialTab);
  // Who the players are comes from its own source; only real ones replace the squad table.
  const observed = useApi(tab === "players" && team ? `observed|${team.id}` : null, (signal) =>
    getObservedPlayers(team!.id, { signal }),
  );

  // Phones fold the grid while a club is shown; desktop always shows it (CSS).
  const [gridOpen, setGridOpen] = useState(false);
  const gridId = useId();
  const changeButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<"change" | "grid" | null>(null);
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === "change") changeButton.current?.focus();
    if (target === "grid") {
      document.getElementById(gridId)?.querySelector<HTMLInputElement>("input:checked")?.focus();
    }
  }, [gridOpen, gridId]);

  const seasonLabel = [competition?.shortName, season?.name].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        actions={
          <div className={css.scope}>
            <label className={css.field}>
              <span>Competición</span>
              <Select
                disabled={!competitions.data}
                onChange={(event) => {
                  setCompetitionId(event.target.value);
                  setSeasonId(null);
                }}
                value={competition?.id ?? ""}
              >
                {competitions.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className={css.field}>
              <span>Temporada</span>
              <Select
                disabled={!competition}
                onChange={(event) => setSeasonId(event.target.value)}
                value={season?.id ?? ""}
              >
                {competition?.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        }
        title="Equipos"
      />

      {competitions.error || standings.error ? (
        <div className={css.error} role="alert">
          <p>No se pudieron cargar los equipos.</p>
          <Button
            onClick={() => (competitions.error ? competitions.retry() : standings.retry())}
            size="sm"
          >
            Reintentar
          </Button>
        </div>
      ) : !team ? (
        <p className={css.status} role="status">
          {competitions.loading || standings.loading
            ? "Cargando equipos…"
            : "No hay equipos en esta temporada."}
        </p>
      ) : (
        <div className={css.view}>
          <div className={css.picker} data-open={gridOpen || undefined}>
            <TeamCrestGrid
              id={gridId}
              onCommit={() => {
                if (window.matchMedia?.(PHONE).matches) {
                  pendingFocus.current = "change";
                  setGridOpen(false);
                }
              }}
              onSelect={(next) => {
                setTeamId(next.id);
              }}
              selectedId={team.id}
              teams={teams}
            />
          </div>

          <section aria-labelledby="team-name" className={css.team}>
            <header className={css.identity}>
              <TeamCrest size={44} team={team} />
              <div className={css.titles}>
                <h2 id="team-name">{team.name}</h2>
                <p>{seasonLabel}</p>
              </div>
              <Button
                aria-controls={gridId}
                aria-expanded={gridOpen}
                className={css.change}
                icon={<ChevronDown aria-hidden="true" size={16} />}
                onClick={() => {
                  pendingFocus.current = gridOpen ? null : "grid";
                  setGridOpen(!gridOpen);
                }}
                ref={changeButton}
                size="sm"
              >
                Cambiar equipo
              </Button>
            </header>

            <Tabs
              items={TABS}
              label="Secciones del equipo"
              onSelect={setTab}
              prefix={TABS_PREFIX}
              selected={tab}
            />
            <div
              aria-busy={(tab === "players" ? observed.loading : detail.loading) || undefined}
              aria-labelledby={tabId(TABS_PREFIX, tab)}
              className={css.panel}
              id={tabPanelId(TABS_PREFIX)}
              role="tabpanel"
              tabIndex={0}
            >
              {tab === "players" && observed.error ? (
                observed.error instanceof ApiRequestError && observed.error.code === "NOT_FOUND" ? (
                  <p className={css.status} role="status">
                    La fuente de datos real no tiene jugadores observados de este equipo.
                  </p>
                ) : (
                  <div className={css.error} role="alert">
                    <p>
                      {observed.error instanceof ApiRequestError
                        ? observed.error.message
                        : "No se pudieron cargar los jugadores."}
                    </p>
                    <Button onClick={observed.retry} size="sm">
                      Reintentar
                    </Button>
                  </div>
                )
              ) : tab === "players" && observed.data && !observed.data.source.synthetic ? (
                <ObservedPlayersList observed={observed.data} seasonLabel={seasonLabel} />
              ) : tab === "players" && !observed.data ? (
                <p className={css.status} role="status">
                  Cargando jugadores…
                </p>
              ) : detail.error ? (
                <div className={css.error} role="alert">
                  <p>No se pudo cargar la temporada del equipo.</p>
                  <Button onClick={detail.retry} size="sm">
                    Reintentar
                  </Button>
                </div>
              ) : !detail.data ? (
                <p className={css.status} role="status">
                  Cargando temporada…
                </p>
              ) : tab === "performance" ? (
                <TeamPerformance season={detail.data} />
              ) : (
                <TeamPlayersTable key={`${detail.data.team.id}|${detail.data.season.id}`} squad={detail.data.squad} seasonId={detail.data.season.id} teamId={detail.data.team.id} />
              )}
            </div>
          </section>
        </div>
      )}

    </>
  );
}
