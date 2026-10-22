import type {
  Competition,
  MatchDetail,
  MatchFilter,
  MatchSummary,
  ObservedMatchDetail,
  ObservedPlayerMatches,
  ObservedPlayers,
  ObservedSquad,
  ObservedTeamMatches,
  ObservedTeamPerformance,
  PlayerProfile,
  RealSection,
  PlayerSeason,
  SourceInfo,
  TeamSeason,
  TeamStanding,
} from "@/contract";
import {
  createLocalApiObservedMatches,
  createLocalApiObservedPlayers,
  createLocalApiObservedSquad,
  createLocalApiTeamPerformance,
  createLocalApiPlayerProfile,
  createLocalApiMatchDetail,
  createLocalApiTeamMatches,
} from "./local-api/local-api-source";
import { syntheticSource } from "./synthetic/synthetic-source";

/**
 * Where the analyst data come from. Route handlers only talk to this
 * interface; each source (synthetic files today, a sports API later) is an
 * adapter that returns contract types. Read-only: `null` means "not found".
 */
export interface DataSource {
  info(): SourceInfo;
  competitions(): Promise<Competition[]>;
  /** Matches of a season, by round and kickoff; `null` if the season does not exist. */
  seasonMatches(seasonId: string, filter: MatchFilter): Promise<MatchSummary[] | null>;
  match(matchId: string): Promise<MatchDetail | null>;
  /** Teams of a season with their table record, by rank. */
  seasonTeams(seasonId: string): Promise<TeamStanding[] | null>;
  teamSeason(seasonId: string, teamId: string): Promise<TeamSeason | null>;
  /** `null` if the player is not in a squad of that season. */
  player(playerId: string, seasonId: string): Promise<PlayerSeason | null>;
  /**
   * Players seen with a team, in no season; `null` if the source has nothing
   * for that team. A real source that fails throws `UpstreamUnavailableError`.
   */
  observedPlayers(teamId: string): Promise<ObservedPlayers | null>;
  /**
   * A team's observed players with their figures in each competition of a
   * real source's scope; `null` without a real source or correspondence.
   * Throws like `observedPlayers`.
   */
  observedSquad(teamId: string): Promise<ObservedSquad | null>;
  /**
   * Personal data of a player from a real source, in no season; `null` if
   * that source does not know the id. Throws like `observedPlayers`.
   */
  playerProfile(playerId: string): Promise<PlayerProfile | null>;
  /**
   * Matches in which a real source lists the player, newest first; `null` if
   * that source does not know the id. Throws like `observedPlayers`.
   */
  playerObservedMatches(playerId: string): Promise<ObservedPlayerMatches | null>;
  /**
   * A team's matches as a real source lists them; `null` if that team has no
   * correspondence in it. Throws like `observedPlayers`.
   */
  teamObservedMatches(teamId: string): Promise<ObservedTeamMatches | null>;
  /**
   * A team's results in each competition of a real source's scope; `null` if
   * that team has no correspondence in it. Throws like `observedPlayers`.
   */
  teamObservedPerformance(teamId: string): Promise<ObservedTeamPerformance | null>;
  /**
   * A real match with its team stats; `null` for an id that is not a real
   * match id or a match the source does not know. Throws like `observedPlayers`.
   */
  matchObservedDetail(matchId: string): Promise<ObservedMatchDetail | null>;
}

/** `synthetic` (default) or `local`, from the variable `name`; anything else is refused. */
function sectionSource(name: "OBSERVED_PLAYERS_SOURCE" | "MATCHES_SOURCE" | "TEAMS_SOURCE"): "synthetic" | "local" {
  const value = process.env[name] || "synthetic";
  if (value !== "synthetic" && value !== "local") {
    throw new Error(`${name}: fuente no disponible: ${value}`);
  }
  return value;
}

/**
 * The configured source. `DATA_SOURCE` will select real adapters later. Two
 * independent switches take one section each from the local API at
 * `LOCAL_DATA_API_URL`, everything else staying synthetic:
 * `OBSERVED_PLAYERS_SOURCE=local` (observed players, their figures per
 * competition, their profiles and matches), `MATCHES_SOURCE=local` (Partidos: the team's real matches) and
 * `TEAMS_SOURCE=local` (Equipos: real teams and their results).
 */
export function getDataSource(): DataSource {
  const kind = process.env.DATA_SOURCE ?? "synthetic";
  if (kind !== "synthetic") {
    throw new Error(`Fuente de datos no disponible: ${kind}`);
  }
  const real: RealSection[] = [];
  if (sectionSource("OBSERVED_PLAYERS_SOURCE") === "local") real.push("observedPlayers");
  if (sectionSource("MATCHES_SOURCE") === "local") real.push("matches");
  if (sectionSource("TEAMS_SOURCE") === "local") real.push("teams");
  if (real.length === 0) return syntheticSource;

  const baseUrl = process.env.LOCAL_DATA_API_URL;
  if (!baseUrl) {
    throw new Error("OBSERVED_PLAYERS_SOURCE=local, MATCHES_SOURCE=local o TEAMS_SOURCE=local requieren LOCAL_DATA_API_URL.");
  }
  const local = { baseUrl };
  return {
    ...syntheticSource,
    info: () => ({ synthetic: true, label: "Datos sintéticos y reales", realSections: real }),
    ...(real.includes("observedPlayers")
      ? {
          observedPlayers: createLocalApiObservedPlayers(local),
          observedSquad: createLocalApiObservedSquad(local),
          playerProfile: createLocalApiPlayerProfile(local),
          playerObservedMatches: createLocalApiObservedMatches(local),
        }
      : {}),
    ...(real.includes("matches")
      ? { teamObservedMatches: createLocalApiTeamMatches(local), matchObservedDetail: createLocalApiMatchDetail(local) }
      : {}),
    ...(real.includes("teams") ? { teamObservedPerformance: createLocalApiTeamPerformance(local) } : {}),
  };
}
