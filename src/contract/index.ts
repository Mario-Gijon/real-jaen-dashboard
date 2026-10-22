/**
 * The analyst API contract (`/api/v1`). It is the only shape shared by the
 * screens and the server, and it describes what the analyst sees, never what a
 * provider returns. Every identifier is ours and stable; no provider id or
 * provider vocabulary appears here.
 */

// ─── Missing values and coverage ────────────────────────────────────────────

/** Why a metric has no value. */
export type MissingReason =
  /** The source does not offer it, or it does not apply (e.g. saves of a defender). */
  | "not_available"
  /** It should exist but has not been collected yet. */
  | "not_collected";

/**
 * One metric in one match. A real zero is `{ value: 0 }`; a missing value
 * always says why, so the interface never turns an absence into a fictitious zero.
 */
export type Stat = { value: number } | { value: null; reason: MissingReason };

/**
 * A metric accumulated over several matches. `of` is the number of matches in
 * scope (the player's appearances, the team's played matches) and `matches`
 * how many of them actually had the metric:
 *
 * - `complete`: every match in scope contributed (`matches === of`);
 * - `partial`: only some did, so `value` is NOT a whole-season figure;
 * - `none`: none did; `reason` is `not_collected` when at least one match was
 *   still pending collection, `not_available` otherwise.
 *
 * Totals are sums; ratios (possession, pass accuracy) are computed over the
 * covered matches only. A per-match average is `value / matches`, never `value / of`.
 */
export type SeasonStat =
  | { value: number; coverage: "complete" | "partial"; matches: number; of: number }
  | { value: null; coverage: "none"; reason: MissingReason; matches: 0; of: number };

// ─── Competition and season ─────────────────────────────────────────────────

export type Season = {
  id: string;
  competitionId: string;
  /** Display name, e.g. "2026/27". */
  name: string;
  /** Number of rounds in the calendar. */
  rounds: number;
  /** Last round with at least one finished match; `null` before the first one. */
  currentRound: number | null;
};

/** `GET /api/v1/competitions` returns `Competition[]`. */
export type Competition = {
  id: string;
  name: string;
  shortName: string;
  /** Newest first. */
  seasons: Season[];
};

// ─── Teams and players ──────────────────────────────────────────────────────

/** Enough of a team to show it anywhere (lists, match header, crest grid). */
export type TeamRef = {
  id: string;
  name: string;
  shortName: string;
  /** Crest image served by the app, or `null` (draw a placeholder with `colors`). */
  crestUrl: string | null;
  /** Primary and secondary kit colours as `#rrggbb`. */
  colors: { primary: string; secondary: string };
};

/** General position of a player, independent of any line-up. */
export type PlayerPosition = "goalkeeper" | "defender" | "midfielder" | "forward";

export type PreferredFoot = "left" | "right" | "both";

/** Enough of a player to name it in a line-up, an event or a table row. */
export type PlayerRef = {
  id: string;
  name: string;
  /** General position, `null` when unknown. */
  position: PlayerPosition | null;
};

/** Personal data. Unknown attributes are `null`, never invented. */
export type Player = PlayerRef & {
  /** ISO date `YYYY-MM-DD`. */
  birthDate: string | null;
  heightCm: number | null;
  preferredFoot: PreferredFoot | null;
};

// ─── Matches ────────────────────────────────────────────────────────────────

export type MatchStatus = "scheduled" | "finished" | "postponed";

export type Side = "home" | "away";

export type Score = { home: number; away: number };

/** One row of a match list. */
export type MatchSummary = {
  id: string;
  seasonId: string;
  round: number;
  /** ISO date-time; `null` when the date is not set (e.g. postponed). */
  kickoff: string | null;
  status: MatchStatus;
  home: TeamRef;
  away: TeamRef;
  /** Final score; `null` unless `status` is `finished`. */
  score: Score | null;
};

/**
 * Place of a starter in the formation drawing: `line` 0 is the goalkeeper,
 * then one line per formation group from defence to attack; `order` goes from
 * left to right (from the team's point of view) starting at 0.
 */
export type LineupSlot = { line: number; order: number };

export type LineupPlayer = {
  player: PlayerRef;
  shirtNumber: number | null;
  /**
   * Where the player stood in this line-up, only when the source says so.
   * Always `null` on the bench, and for starters whose slot is unknown.
   */
  slot: LineupSlot | null;
};

export type Lineup = {
  /** As announced, e.g. "4-2-3-1"; `null` when unknown. */
  formation: string | null;
  starters: LineupPlayer[];
  /** Every substitute named, whether they played or not. */
  bench: LineupPlayer[];
};

/** Optional video clip of an action. Nothing in the app plays it yet. */
export type Clip = { clipUrl: string; startSec: number; endSec: number };

type EventBase = {
  id: string;
  matchId: string;
  /**
   * Team of the player who performs the action. For an own goal this is NOT
   * the team that scores: see `GoalEvent.ownGoal`.
   */
  teamId: string;
  /** Match minute (1–90); added time goes in `addedTime` (45+2 → 45, 2). */
  minute: number;
  addedTime: number | null;
  clip: Clip | null;
};

/**
 * A goal. `player` is who put the ball in the net and `teamId` is their team.
 * The goal counts in the score for `teamId`, unless `ownGoal` is true: then
 * it counts for the opponent. An own goal has no assist, is never a penalty and
 * does not add to the player's `goals` (see {@link scoringSide}).
 */
export type GoalEvent = EventBase & {
  type: "goal";
  player: PlayerRef;
  /** `null` when nobody is credited with the assist (always for an own goal). */
  assist: PlayerRef | null;
  penalty: boolean;
  ownGoal: boolean;
};

/** Side whose score a goal adds to, given the side of the player's team. */
export function scoringSide(goal: Pick<GoalEvent, "ownGoal">, playerSide: Side): Side {
  if (!goal.ownGoal) return playerSide;
  return playerSide === "home" ? "away" : "home";
}

export type CardEvent = EventBase & {
  type: "card";
  player: PlayerRef;
  /**
   * The real card, never simplified: `second_yellow` is a player's second
   * yellow, which sends them off; `red` is a straight red.
   */
  card: "yellow" | "second_yellow" | "red";
};

export type SubstitutionEvent = EventBase & {
  type: "substitution";
  playerIn: PlayerRef;
  playerOut: PlayerRef;
};

/** Ordered by minute, then added time. */
export type MatchEvent = GoalEvent | CardEvent | SubstitutionEvent;

export const TEAM_STAT_KEYS = [
  "possession",
  "shots",
  "shotsOnTarget",
  "xg",
  "corners",
  "fouls",
  "yellowCards",
  "redCards",
] as const;
export type TeamStatKey = (typeof TEAM_STAT_KEYS)[number];
/**
 * `possession` is a percentage (home + away = 100); `xg` has two decimals.
 * `yellowCards` and `redCards` are derived from card events as in
 * {@link PlayerMatchStats}.
 */
export type TeamMatchStats = Record<TeamStatKey, Stat>;

export const PLAYER_STAT_KEYS = [
  "minutes",
  "goals",
  "assists",
  "shots",
  "shotsOnTarget",
  "passes",
  "passAccuracy",
  "dribbles",
  "dribblesWon",
  "recoveries",
  "possessionLost",
  "fouls",
  "yellowCards",
  "redCards",
  "saves",
  "goalsConceded",
] as const;
export type PlayerStatKey = (typeof PLAYER_STAT_KEYS)[number];
/**
 * `passAccuracy` is a percentage with one decimal; `fouls` are committed;
 * `saves` and `goalsConceded` are `not_available` for outfield players.
 *
 * `goals` excludes own goals. Cards are derived from card events:
 * `yellowCards` counts `yellow` events and `redCards` counts `second_yellow`
 * and `red` events. A player sent off for two yellows therefore has
 * `yellowCards: 1, redCards: 1`; the event list keeps which card it was.
 */
export type PlayerMatchStats = Record<PlayerStatKey, Stat>;

/** `GET /api/v1/matches/{matchId}`. */
export type MatchDetail = MatchSummary & {
  /** `null` until known (scheduled and postponed matches). */
  lineups: { home: Lineup; away: Lineup } | null;
  events: MatchEvent[];
  teamStats: { home: TeamMatchStats; away: TeamMatchStats } | null;
  /** Players who took part, by player id. Unused substitutes have no entry. */
  playerStats: Record<string, PlayerMatchStats>;
};

// ─── Season views ───────────────────────────────────────────────────────────

export type MatchResult = "win" | "draw" | "loss";

/** Table record, derived from finished matches only. */
export type TeamRecord = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

/** `GET /api/v1/seasons/{seasonId}/teams` returns `TeamStanding[]`, by rank. */
export type TeamStanding = { rank: number; team: TeamRef; record: TeamRecord };

/** One of a team's matches, seen from that team. */
export type TeamMatch = {
  match: MatchSummary;
  side: Side;
  opponent: TeamRef;
  /** `null` unless the match is finished. */
  result: MatchResult | null;
  /**
   * Team stats of that match from this team's side: `own` is what the team
   * did, `opponent` what its rival did (so, what the team conceded).
   * `null` unless the match is finished.
   */
  teamStats: { own: TeamMatchStats; opponent: TeamMatchStats } | null;
};

export type PlayerSeasonStats = Record<PlayerStatKey | "appearances" | "starts", SeasonStat>;
export type TeamSeasonStats = Record<TeamStatKey, SeasonStat>;

/** A squad member with the season accumulated for this team. */
export type SquadPlayer = {
  player: PlayerRef;
  shirtNumber: number | null;
  stats: PlayerSeasonStats;
};

/** `GET /api/v1/seasons/{seasonId}/teams/{teamId}`. */
export type TeamSeason = {
  season: Season;
  team: TeamRef;
  standing: TeamStanding;
  /** Whole calendar, by round. */
  matches: TeamMatch[];
  stats: TeamSeasonStats;
  squad: SquadPlayer[];
};

/** One match of a player: what they did and the actions that name them. */
export type PlayerMatch = {
  match: MatchSummary;
  side: Side;
  started: boolean;
  stats: PlayerMatchStats;
  /** Goals, assists, cards and substitutions involving the player. */
  events: MatchEvent[];
};

/** `GET /api/v1/players/{playerId}?season={seasonId}`. */
export type PlayerSeason = {
  season: Season;
  player: Player;
  team: TeamRef;
  shirtNumber: number | null;
  stats: PlayerSeasonStats;
  /** Matches the player took part in, by round. */
  matches: PlayerMatch[];
};

// ─── Observed players ───────────────────────────────────────────────────────

/** Who supplied one response, when a section may not use the app's main source. */
export type DataProvenance = {
  /** Invented data. */
  synthetic: boolean;
  /** Short description for the analyst, in Spanish. */
  label: string;
};

/**
 * `GET /api/v1/teams/{teamId}/players`: players seen with a team. It is not a
 * full nor necessarily current squad and it belongs to no season; `scope`
 * says what the list covers. A real source offers no stats nor personal data
 * here, so none appear.
 *
 * Player ids from a real source are derived from the provider's own ids
 * (e.g. `sofascore-player-966303`): stable while that provider is used, but
 * not an identity independent of it. Screens treat them as opaque.
 */
export type ObservedPlayers = {
  teamId: string;
  players: PlayerRef[];
  /** What the list covers, for the analyst, in Spanish. */
  scope: string;
  source: DataProvenance;
};

/**
 * `GET /api/v1/players/{playerId}/profile`: a player's personal data only, as
 * a real source gives them. It belongs to no season and claims no current
 * team: there are no stats, shirt number or team here. Unknown attributes are
 * `null`, never filled in. `scope` says what the profile covers.
 */
export type PlayerProfile = {
  player: Player & {
    /** Country the source associates with the player, as the source names it. */
    country: string | null;
  };
  /** What the profile covers, for the analyst, in Spanish. */
  scope: string;
  source: DataProvenance;
};

// ─── Observed matches of a real player ──────────────────────────────────────

/** A team as a real source names it; `name` is `null` when the source cannot name it. */
export type ObservedTeam = { id: string; name: string | null };

export const OBSERVED_MATCH_STAT_KEYS = [
  "minutes",
  "goals",
  "assists",
  "shots",
  "shotsOnTarget",
  "xg",
  "passesCompleted",
  "passes",
  "dribbles",
  "dribblesWon",
  "recoveries",
  "possessionLost",
  "duelsWon",
  "duelsLost",
  "fouls",
  "saves",
  "rating",
] as const;
export type ObservedMatchStatKey = (typeof OBSERVED_MATCH_STAT_KEYS)[number];

/**
 * A match as a real source lists it. Ids are derived from the provider's
 * (`sofascore-match-…`, `sofascore-team-…`) and lead to no synthetic match;
 * season, competition and round are the source's, never the app's.
 */
export type ObservedMatch = {
  id: string;
  /** ISO date-time; `null` when unknown. */
  kickoff: string | null;
  /** `null` when the source gives a status the app does not know. */
  status: MatchStatus | null;
  competition: string | null;
  /** Season as the source names it (e.g. "26/27"); never the app's selected season. */
  season: string | null;
  round: number | null;
  home: ObservedTeam;
  away: ObservedTeam;
  /** Final score; `null` unless finished and given (a pending match never reads 0–0). */
  score: Score | null;
};

/** One match in which a real source lists the player in a squad: a call-up, not necessarily an appearance. */
export type ObservedPlayerMatch = {
  match: ObservedMatch;
  /** Side of the player's team. */
  side: Side;
  /** Named as starter or substitute; `null` when unknown. */
  role: "starter" | "substitute" | null;
  /** Position in this match's line-up, as the source gives it; not the player's usual position. */
  position: PlayerPosition | null;
  /**
   * `confirmed` only when the source says the player took part. `unknown`
   * never means "did not play": the source simply does not say.
   */
  participation: "confirmed" | "unknown";
  /**
   * As given by the source; a value it omits is missing, never 0. Without
   * confirmed participation every value is missing. `xg` keeps its decimals;
   * `rating` is the provider's own rating (see `ratingSource`). `fouls` are
   * committed; `duelsWon`/`duelsLost` include aerial duels; `dribbles` are
   * attempted and `dribblesWon` successful. No pass accuracy is stored: it is
   * derived from `passesCompleted` and `passes` only when both are known.
   */
  stats: Record<ObservedMatchStatKey, Stat>;
};

/** `GET /api/v1/players/{playerId}/observed-matches`. */
export type ObservedPlayerMatches = {
  playerId: string;
  /** Newest first. */
  matches: ObservedPlayerMatch[];
  /** What the list covers, for the analyst, in Spanish. */
  scope: string;
  /** Who computes `stats.rating`, to label it (e.g. "SofaScore"). */
  ratingSource: string;
  source: DataProvenance;
};

/**
 * `GET /api/v1/teams/{teamId}/observed-matches`: a team's matches as a real
 * source lists them, by kickoff (undated last). Not necessarily a complete
 * calendar; `scope` says so.
 */
/**
 * A competition a real source serves in this version (its declared scope),
 * as the source names it: e.g. one group of a league in one season. Nothing
 * outside the scope is ever returned.
 */
export type ObservedCompetition = { name: string; season: string | null };

export type ObservedTeamMatches = {
  teamId: string;
  matches: { match: ObservedMatch; side: Side }[];
  /** The competitions the source serves, whether or not they have matches here. */
  competitions: ObservedCompetition[];
  /** What the list covers, for the analyst, in Spanish. */
  scope: string;
  source: DataProvenance;
};

/** What a team produces and concedes per match, as «Rendimiento» shows it; `…Against` is what its rivals did. */
export const TEAM_OUTPUT_INDICATORS = [
  "goals", "xg", "shots", "shotsOnTarget",
  "goalsAgainst", "xgAgainst", "shotsAgainst", "shotsOnTargetAgainst",
  "possession", "corners",
] as const;
export type TeamOutputIndicator = (typeof TEAM_OUTPUT_INDICATORS)[number];

/**
 * Per-match averages over a team's counted matches: each one over the
 * matches that have the value (`matches` of `of`), `null` when none has it
 * (never 0). Possession is the arithmetic mean of the percentages.
 */
export type ObservedTeamOutput = {
  season: Record<TeamOutputIndicator, SeasonStat>;
  /**
   * The three most recent counted matches with a date (oldest first), and
   * the averages over them: chosen first, then each value's coverage.
   */
  last3: { matchIds: string[]; values: Record<TeamOutputIndicator, SeasonStat> };
  /** Counted matches without a date: in the season averages, never in «Últimos 3». */
  undated: number;
};

/**
 * Results of a team in one competition of a real source's scope, from its
 * finished matches with a valid score only: the observed sample, not
 * necessarily the whole season. There is no table position nor points.
 */
export type ObservedCompetitionPerformance = {
  /**
   * Our id for one competition group in one season, derived from the
   * provider's ids: `sofascore-scope-{tournamentId}-{seasonId}`. Stable while
   * that source is used; never related to a synthetic season.
   */
  id: string;
  name: string;
  season: string | null;
  /**
   * The team's matches in this competition by state. Only `counted` ones
   * (finished with a valid score) make the record; a finished match without
   * one is reported here, never read as 0–0.
   */
  matches: { inScope: number; finished: number; pending: number; counted: number; finishedWithoutValidScore: number; unknownStatus: number };
  record: { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDifference: number };
  venues: Record<Side, Record<MatchResult, number>>;
  /** The counted matches, oldest first, seen from the team. */
  results: { match: ObservedMatch; side: Side; result: MatchResult; goalsFor: number; goalsAgainst: number }[];
  /** Production and concession over the same matches; `null` when the source's figures could not be read. */
  output: ObservedTeamOutput | null;
};

/** `GET /api/v1/teams/{teamId}/observed-performance`. */
export type ObservedTeamPerformance = {
  teamId: string;
  /** One per competition of the source's scope, in the source's order. */
  competitions: ObservedCompetitionPerformance[];
  /** Teams with an explicit correspondence in this source: the ones that can be analysed. */
  teams: ObservedTeam[];
  /** What the figures cover, for the analyst, in Spanish. */
  scope: string;
  source: DataProvenance;
};

/**
 * A player in a real match's line-up, in the source's order. No formation,
 * pitch slot, events or individual stats here.
 */
export type ObservedLineupPlayer = {
  /** Id derived from the provider's (`sofascore-player-…`). */
  player: PlayerRef;
  shirtNumber: number | null;
  /** From the source's explicit flag; `null` when it does not say, never guessed. */
  role: "starter" | "substitute" | null;
  /** As in {@link ObservedPlayerMatch}: a named substitute is not a player who took part. */
  participation: "confirmed" | "unknown";
  /** Only with confirmed participation; otherwise missing. */
  minutes: Stat;
};

/**
 * A goal as a real source records it. `kind` keeps what the source says:
 * `regular`, `penalty`, `ownGoal` (`scorer` put it in their own net) or
 * `unknown` (a class the app does not know), so they are never all counted
 * as ordinary goals. Penalty shoot-out kicks are not goals here.
 */
export type ObservedGoal = {
  kind: "regular" | "penalty" | "ownGoal" | "unknown";
  minute: number | null;
  addedTime: number | null;
  scorer: PlayerRef | null;
  /** Only when the source names the assistant; never inferred. */
  assist: PlayerRef | null;
};

/** A substitution as a real source records it; nothing is inferred from minutes played. */
export type ObservedSubstitution = {
  minute: number | null;
  addedTime: number | null;
  playerIn: PlayerRef | null;
  playerOut: PlayerRef | null;
};

/**
 * A section of a real match, as the source keeps it: `stored` with content,
 * `empty` (stored without content), `not_stored` (normal for a pending
 * match) or `error` (the source could not be queried for it).
 */
export type ObservedSectionState = "stored" | "empty" | "not_stored" | "error";

/**
 * `GET /api/v1/matches/{matchId}/observed`: a real match with the team
 * stats and line-ups the source keeps, each section with its own state.
 * Values the source omits are missing, never 0. `fetchedAt` is when the
 * source was read, not when its content changed. No interpreted events or
 * narrative here.
 */
export type ObservedMatchDetail = {
  match: ObservedMatch;
  statistics:
    | { state: "stored"; fetchedAt: string | null; home: TeamMatchStats; away: TeamMatchStats }
    | { state: Exclude<ObservedSectionState, "stored">; fetchedAt: string | null };
  lineups:
    | {
        state: "stored";
        fetchedAt: string | null;
        /** Whether the source marks the line-ups as confirmed; `null` when it does not say. */
        confirmed: boolean | null;
        home: ObservedLineupPlayer[];
        away: ObservedLineupPlayer[];
      }
    | { state: Exclude<ObservedSectionState, "stored">; fetchedAt: string | null };
  /**
   * The goals and substitutions among the source's incidents, enough to mark
   * them on the line-ups. Not a timeline: cards, VAR, periods or missed
   * penalties are left out. An empty list does not prove nothing happened.
   */
  incidents:
    | { state: "stored"; fetchedAt: string | null; goals: ObservedGoal[]; substitutions: ObservedSubstitution[] }
    | { state: Exclude<ObservedSectionState, "stored">; fetchedAt: string | null };
  /** What the detail covers, for the analyst, in Spanish. */
  scope: string;
  source: DataProvenance;
};

export { seasonStat, type Accumulation } from "./season-stat";

// ─── Application ────────────────────────────────────────────────────────────

/** `GET /api/v1/source`: what the interface may know about the data source. */
export type SourceInfo = {
  /** Data are invented and must be labelled as such on every screen. */
  synthetic: boolean;
  /** Short description for the analyst, in Spanish. */
  label: string;
  /**
   * Sections served by a real source instead of the synthetic data, so a
   * screen picks its real view without guessing: `observedPlayers` (Equipos ›
   * Jugadores and real player profiles) and `matches` (Partidos).
   */
  realSections: RealSection[];
};

export type RealSection = "observedPlayers" | "matches" | "teams";

/** Error body of every `/api/v1` endpoint. */
export type ApiError = { error: { code: ApiErrorCode; message: string } };
/** `UPSTREAM_UNAVAILABLE` (503): a real source did not answer, or answered something unusable. */
export type ApiErrorCode = "NOT_FOUND" | "BAD_REQUEST" | "UPSTREAM_UNAVAILABLE";

/** Filters of `GET /api/v1/seasons/{seasonId}/matches` (`?round=&team=`). */
export type MatchFilter = { round?: number; teamId?: string };
