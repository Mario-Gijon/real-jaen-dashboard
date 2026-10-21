import type {
  Competition,
  MatchDetail,
  MatchFilter,
  MatchSummary,
  ObservedPlayers,
  PlayerProfile,
  PlayerSeason,
  SourceInfo,
  TeamSeason,
  TeamStanding,
} from "@/contract";
import {
  createLocalApiObservedPlayers,
  createLocalApiPlayerProfile,
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
   * Personal data of a player from a real source, in no season; `null` if
   * that source does not know the id. Throws like `observedPlayers`.
   */
  playerProfile(playerId: string): Promise<PlayerProfile | null>;
}

/**
 * The configured source. `DATA_SOURCE` will select real adapters later;
 * `OBSERVED_PLAYERS_SOURCE=local` takes the observed players and their
 * personal profiles from the local API at `LOCAL_DATA_API_URL`, everything
 * else staying synthetic.
 */
export function getDataSource(): DataSource {
  const kind = process.env.DATA_SOURCE ?? "synthetic";
  if (kind !== "synthetic") {
    throw new Error(`Fuente de datos no disponible: ${kind}`);
  }
  const observed = process.env.OBSERVED_PLAYERS_SOURCE ?? "synthetic";
  if (observed === "synthetic") return syntheticSource;
  if (observed !== "local") {
    throw new Error(`Fuente de jugadores observados no disponible: ${observed}`);
  }
  const baseUrl = process.env.LOCAL_DATA_API_URL;
  if (!baseUrl) {
    throw new Error("OBSERVED_PLAYERS_SOURCE=local requiere LOCAL_DATA_API_URL.");
  }
  return {
    ...syntheticSource,
    info: () => ({ synthetic: true, label: "Datos sintéticos y reales" }),
    observedPlayers: createLocalApiObservedPlayers({ baseUrl }),
    playerProfile: createLocalApiPlayerProfile({ baseUrl }),
  };
}
