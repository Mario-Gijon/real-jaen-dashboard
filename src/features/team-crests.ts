import type { ObservedTeam } from "@/contract";

/**
 * Crest images of real teams, by our public team id: local files served from
 * `public/`, never fetched from a provider by the browser. A team appears here
 * only with a file of known provenance (see README, «Escudos»); any other team,
 * or a file that fails to load, draws TeamCrest's neutral shield.
 */
const TEAM_CRESTS: Readonly<Record<string, string>> = {
  "team-real-jaen": "/real-jaen-crest.png",
};

/** The crest of a team, `null` when there is none: never another team's. */
export function crestUrlOf(teamId: string): string | null {
  return TEAM_CRESTS[teamId] ?? null;
}

/** No colours are invented for a real team: its crest file, or a neutral shield. */
const NEUTRAL = { primary: "#e3deea", secondary: "#5e6172" };

/** What TeamCrest needs for a real team: its source name and its crest file (`crestUrlOf`), or a neutral shield. */
export function observedCrest(team: ObservedTeam) {
  const name = team.name ?? "Equipo sin identificar";
  return { name, shortName: name, crestUrl: crestUrlOf(team.id), colors: NEUTRAL };
}
