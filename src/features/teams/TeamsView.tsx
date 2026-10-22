"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ApiRequestError, getCompetitions, getObservedPlayers, getSeasonTeams, getSource, getTeamObservedPerformance, getTeamSeason,
} from "@/client/api";
import type { ObservedCompetitionPerformance, ObservedTeam, TeamRef } from "@/contract";
import { Button } from "@/ui/Button";
import { PageHeader } from "@/ui/PageHeader";
import { ProvenanceNotice } from "@/ui/ProvenanceNotice";
import { Select } from "@/ui/Select";
import { TeamCrest } from "@/ui/TeamCrest";
import { tabId, tabPanelId, Tabs } from "@/ui/Tabs";
import { observedCrest } from "../matches/ObservedMatchList";
import { observedMatchHref } from "../players/navigation";
import { useApi } from "../use-api";
import { ObservedPlayersList } from "./ObservedPlayersList";
import { TeamCrestGrid } from "./TeamCrestGrid";
import { RealTeamPerformance, TeamPerformance } from "./TeamPerformance";
import { TeamPlayersTable } from "./TeamPlayersTable";
import css from "./TeamsView.module.css";

/** The analyst's club: selected by default and first in the grid. */
export const CLUB_TEAM_ID = "team-real-jaen";

type Tab = "performance" | "players";
type Props = { initialTeamId?: string; initialSeasonId?: string; initialTab?: Tab };
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
 * «Equipos»: the API says whether this section comes from the real source
 * (`TEAMS_SOURCE`); a real page loads nothing synthetic and a synthetic one
 * nothing real but its observed players. If it cannot say, nothing is assumed.
 */
export function TeamsView(props: Props) {
  const source = useApi("source", (signal) => getSource({ signal }));
  if (source.error) return <>
    <PageHeader title="Equipos" />
    <div className={css.error} role="alert">
      <p>No se pudo determinar la fuente de los equipos.</p>
      <Button onClick={source.retry} size="sm">Reintentar</Button>
    </div>
  </>;
  if (!source.data) return <>
    <PageHeader title="Equipos" />
    <p className={css.status} role="status">Cargando equipos…</p>
  </>;
  const real = source.data.realSections;
  return real.includes("teams")
    ? <RealTeamsView {...props} realMatches={real.includes("matches")} realPlayers={real.includes("observedPlayers")} />
    : <SyntheticTeamsView {...props} />;
}

/**
 * One club's whole season from the synthetic source. Competition and season
 * pick the teams, a crest grid picks the club and two tabs show its
 * collective performance and its squad.
 */
function SyntheticTeamsView({ initialTeamId, initialSeasonId, initialTab = "performance" }: Props) {
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
        <TeamShell
          busy={tab === "players" ? observed.loading : detail.loading}
          onSelectTeam={setTeamId}
          onTab={setTab}
          subtitle={seasonLabel}
          tab={tab}
          team={team}
          teams={teams}
        >
          {tab === "players" && observed.error ? (
            <ObservedError error={observed.error} retry={observed.retry} />
          ) : tab === "players" && observed.data && !observed.data.source.synthetic ? (
            <ObservedPlayersList observed={observed.data} seasonId={season?.id ?? null} seasonLabel={seasonLabel} />
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
        </TeamShell>
      )}

    </>
  );
}

/** A real team as the crest grid and header draw it: the source's name and a neutral shield (the club keeps its crest). */
const realTeamRef = (team: ObservedTeam): TeamRef => ({ id: team.id, ...observedCrest(team) });

/**
 * Teams from the real source (`TEAMS_SOURCE=local`): only teams with an
 * explicit correspondence, and the competitions of the source's scope as
 * seasons, never related to the synthetic ones. Performance shows the
 * results of the observed finished matches; the players tab shows the real
 * observed players when that source is enabled, and says so when it is not.
 * Nothing synthetic is loaded.
 */
function RealTeamsView({ initialTeamId, initialSeasonId, initialTab = "performance", realMatches, realPlayers }: Props & {
  realMatches: boolean; realPlayers: boolean;
}) {
  const [teamId, setTeamId] = useState(initialTeamId ?? CLUB_TEAM_ID);
  const load = useApi(`real-team|${teamId}`, (signal) => getTeamObservedPerformance(teamId, { signal }));
  // A season id from the URL must be one of the source's; a synthetic one is said so, never swapped.
  const [seasonId, setSeasonId] = useState<string | null>(initialSeasonId ?? null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const observed = useApi(realPlayers && tab === "players" ? `observed|${teamId}` : null, (signal) =>
    getObservedPlayers(teamId, { signal }),
  );
  const competitions = load.data?.competitions ?? [];
  const competition: ObservedCompetitionPerformance | null =
    seasonId === null ? competitions[0] ?? null : competitions.find((c) => c.id === seasonId) ?? null;
  const notFound = load.error instanceof ApiRequestError && load.error.code === "NOT_FOUND";
  const teams = useMemo(() => gridOrder((load.data?.teams ?? []).map(realTeamRef)), [load.data]);
  const team = teams.find((t) => t.id === teamId) ?? realTeamRef({ id: teamId, name: null });
  const subtitle = competition ? [competition.name, competition.season].filter(Boolean).join(" · ") : "";
  const matchHref = realMatches ? (matchId: string) => observedMatchHref(matchId) : null;

  return (
    <>
      <PageHeader
        actions={
          <div className={css.scope}>
            <p className={`${css.field} ${css.fixed}`}>
              <span>Competición</span>
              {competition?.name ?? "—"}
            </p>
            <label className={css.field}>
              <span>Temporada</span>
              <Select disabled={!competitions.length} onChange={(event) => setSeasonId(event.target.value)} value={competition?.id ?? ""}>
                {competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.season ?? c.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        }
        title="Equipos"
      />

      {notFound ? (
        <div className={css.status} role="status">
          <p>Este equipo no tiene correspondencia con la fuente real de equipos.</p>
          {/* Same page: the link also resets what the URL had chosen. */}
          <Link href="/teams" onClick={() => setTeamId(CLUB_TEAM_ID)}>Ver el Real Jaén</Link>
        </div>
      ) : load.error ? (
        <div className={css.error} role="alert">
          <p>No se pudieron cargar los datos reales del equipo.</p>
          <Button onClick={load.retry} size="sm">Reintentar</Button>
        </div>
      ) : !load.data ? (
        <p className={css.status} role="status">Cargando equipo…</p>
      ) : !competition ? (
        <div className={css.status} role="status">
          <p>
            {competitions.length
              ? "La temporada indicada no corresponde a la fuente real de equipos: sus temporadas son las de la fuente."
              : "La fuente real no tiene competiciones para este equipo."}
          </p>
          {competitions.length ? <Link href="/teams" onClick={() => setSeasonId(null)}>Ver la temporada real</Link> : null}
        </div>
      ) : (
        <TeamShell
          busy={tab === "players" && observed.loading}
          onSelectTeam={setTeamId}
          onTab={setTab}
          subtitle={subtitle}
          tab={tab}
          team={team}
          teams={teams}
        >
          {tab === "performance" ? (
            <div className={css.real}>
              <ProvenanceNotice source={load.data.source}>
                <p>{load.data.scope}</p>
                <p>{coverage(competition)}</p>
              </ProvenanceNotice>
              <RealTeamPerformance competition={competition} key={`${teamId}|${competition.id}`} matchHref={matchHref} />
            </div>
          ) : !realPlayers ? (
            <p className={css.status} role="status">La fuente real de jugadores no está activada.</p>
          ) : observed.error ? (
            <ObservedError error={observed.error} retry={observed.retry} />
          ) : !observed.data ? (
            <p className={css.status} role="status">Cargando jugadores…</p>
          ) : (
            <ObservedPlayersList observed={observed.data} seasonId={competition.id} seasonLabel={subtitle} />
          )}
        </TeamShell>
      )}
    </>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the figures rest on: counted finished matches out of the observed ones, and what was left out. */
function coverage({ matches }: ObservedCompetitionPerformance): string {
  const parts = [
    `${plural(matches.counted, "partido finalizado", "partidos finalizados")} con resultado de ${plural(matches.inScope, "partido observado", "partidos observados")} en esta competición (${plural(matches.pending, "pendiente", "pendientes")}).`,
  ];
  if (matches.finishedWithoutValidScore) {
    parts.push(`${plural(matches.finishedWithoutValidScore, "finalizado sin marcador válido no se incluye", "finalizados sin marcador válido no se incluyen")}.`);
  }
  if (matches.unknownStatus) {
    parts.push(`${plural(matches.unknownStatus, "partido con estado desconocido no se incluye", "partidos con estado desconocido no se incluyen")}.`);
  }
  return parts.join(" ");
}

/** The observed players could not be read: a team the source does not know, or a failure with retry. */
function ObservedError({ error, retry }: { error: unknown; retry: () => void }) {
  return error instanceof ApiRequestError && error.code === "NOT_FOUND" ? (
    <p className={css.status} role="status">
      La fuente de datos real no tiene jugadores observados de este equipo.
    </p>
  ) : (
    <div className={css.error} role="alert">
      <p>{error instanceof ApiRequestError ? error.message : "No se pudieron cargar los jugadores."}</p>
      <Button onClick={retry} size="sm">
        Reintentar
      </Button>
    </div>
  );
}

/**
 * The crest grid (folded on phones once a club is chosen), the chosen club's
 * header and its two tabs, whatever the source of what the tabs show.
 */
function TeamShell({ teams, team, subtitle, tab, onTab, onSelectTeam, busy, children }: {
  teams: readonly TeamRef[]; team: TeamRef; subtitle: string; tab: Tab; onTab: (tab: Tab) => void;
  onSelectTeam: (teamId: string) => void; busy: boolean; children: ReactNode;
}) {
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

  return (
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
            onSelectTeam(next.id);
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
            <p>{subtitle}</p>
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
          onSelect={onTab}
          prefix={TABS_PREFIX}
          selected={tab}
        />
        <div
          aria-busy={busy || undefined}
          aria-labelledby={tabId(TABS_PREFIX, tab)}
          className={css.panel}
          id={tabPanelId(TABS_PREFIX)}
          role="tabpanel"
          tabIndex={0}
        >
          {children}
        </div>
      </section>
    </div>
  );
}
