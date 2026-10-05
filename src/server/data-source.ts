import type {
  Competition,
  MatchDetail,
  MatchFilter,
  MatchSummary,
  PlayerSeason,
  SourceInfo,
  TeamSeason,
  TeamStanding,
} from "@/contract";
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
}

/** The configured source. `DATA_SOURCE` will select real adapters later. */
export function getDataSource(): DataSource {
  const kind = process.env.DATA_SOURCE ?? "synthetic";
  if (kind !== "synthetic") {
    throw new Error(`Fuente de datos no disponible: ${kind}`);
  }
  return syntheticSource;
}
