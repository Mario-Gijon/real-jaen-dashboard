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
