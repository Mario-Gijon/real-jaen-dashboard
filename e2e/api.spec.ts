import { expect, test } from "@playwright/test";

/** Technical check that the built app serves the read-only API v1. */
test("serves the synthetic season through /api/v1", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "La API no depende del viewport.");

  const competitions = await (await request.get("/api/v1/competitions")).json();
  const seasonId: string = competitions[0].seasons[0].id;

  const matches = await request.get(
    `/api/v1/seasons/${seasonId}/matches?round=1&team=team-real-jaen`,
  );
  expect(matches.ok()).toBe(true);
  const [match] = await matches.json();

  const detail = await (await request.get(`/api/v1/matches/${match.id}`)).json();
  expect(detail.lineups.home.starters).toHaveLength(11);

  const team = await (await request.get(`/api/v1/seasons/${seasonId}/teams/team-real-jaen`)).json();
  const playerId: string = team.squad[0].player.id;
  expect((await request.get(`/api/v1/players/${playerId}?season=${seasonId}`)).ok()).toBe(true);

  expect((await request.get("/api/v1/matches/no-existe")).status()).toBe(404);
  expect((await request.post("/api/v1/competitions")).status()).toBe(405);
});
