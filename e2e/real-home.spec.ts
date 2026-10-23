import { expect, test, type Page } from "@playwright/test";
import { REAL_SOURCE } from "./sources";

/*
 * «Inicio» with the real source. The e2e server is synthetic, so these tests
 * answer the browser's /api/v1 requests for the real sections themselves:
 * simulated responses, not the local API. The upcoming matches are far ahead
 * so that the server's clock always finds them in the future.
 */

const jaen = { id: "team-real-jaen", name: "Real Jaén" };
const rival = { id: "sofascore-team-24326", name: "Atlético Madrileño" };
const next = { id: "sofascore-team-4489", name: "Algeciras CF" };
const other = { id: "sofascore-team-2840", name: "Gimnàstic de Tarragona" };
type Team = { id: string; name: string };
const match = (id: number, kickoff: string, status: string, home: Team, away: Team, round: number,
  score: { home: number; away: number } | null = null) => ({
  id: `sofascore-match-${id}`, kickoff, status, competition: "Primera Federación, Grupo 2", season: "26/27", round, home, away, score,
});
const target = match(9, "2030-10-25T11:00:00+00:00", "scheduled", rival, jaen, 9);
const second = match(10, "2030-11-02T17:15:00+00:00", "scheduled", jaen, next, 10);
const postponed = match(5, "2026-09-27T16:15:00+00:00", "postponed", jaen, other, 5);
const played = [1, 2, 3, 4, 5, 6].map((n) => match(100 + n, `2026-09-${String(n * 4).padStart(2, "0")}T17:00:00+00:00`, "finished",
  n % 2 ? rival : other, n % 2 ? other : rival, n, { home: n % 3, away: 1 }));
const SOURCE = { synthetic: false, label: "Datos reales" };
const rowsOf = (matches: ReturnType<typeof match>[], team: { id: string }) =>
  matches.map((m) => ({ match: m, side: m.home.id === team.id ? "home" : "away" }));
const listing = (teamId: string, matches: ReturnType<typeof match>[], team: { id: string }) => ({
  teamId, matches: rowsOf(matches, team), competitions: [{ name: "Primera Federación, Grupo 2", season: "26/27" }],
  scope: "Partidos del equipo que registra la fuente.", source: SOURCE,
});
const missing = { value: null, reason: "not_available" };
const stats = (xg: number) => ({ possession: missing, shots: missing, shotsOnTarget: missing, xg: { value: xg }, corners: missing,
  fouls: missing, yellowCards: missing, redCards: missing });

async function serveReal(page: Page) {
  await page.route("**/api/v1/source", (route) =>
    route.fulfill({ json: REAL_SOURCE }));
  await page.route("**/api/v1/teams/*/observed-matches", (route) => {
    const teamId = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2)!);
    return route.fulfill({ json: teamId === jaen.id ? listing(teamId, [postponed, target, second], jaen)
      : teamId === rival.id ? listing(teamId, [...played, target], rival) : listing(teamId, [second], next) });
  });
  await page.route("**/api/v1/teams/*/observed-performance", (route) => {
    const teamId = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2)!);
    const results = teamId === rival.id ? rowsOf(played, rival).map(({ match: m, side }) => {
      const own = m.score![side as "home" | "away"], against = m.score![side === "home" ? "away" : "home"];
      return { match: m, side, result: own > against ? "win" : own === against ? "draw" : "loss", goalsFor: own, goalsAgainst: against };
    }) : [];
    return route.fulfill({ json: { teamId, teams: [jaen, rival, next], scope: "Rendimiento.", source: SOURCE,
      competitions: [{ id: "sofascore-scope-94191-97382", name: "Primera Federación, Grupo 2", season: "26/27", results }] } });
  });
  await page.route("**/api/v1/matches/*/observed", (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2)!);
    const found = [...played, target, second].find((m) => m.id === id)!;
    return route.fulfill({ json: { match: found, statistics: { state: "stored", fetchedAt: null, home: stats(1.25), away: stats(0.5) },
      lineups: { state: "not_stored", fetchedAt: null }, incidents: { state: "not_stored", fetchedAt: null },
      scope: "Partido según la fuente.", source: SOURCE } });
  });
}
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("Inicio real: next current match, rival's last five before it, Volver a Inicio and a new target", async ({ page }) => {
  await serveReal(page);
  const synthetic: string[] = [];
  page.on("request", (r) => { if (/\/api\/v1\/(competitions|seasons\/)/.test(r.url())) synthetic.push(r.url()); });
  await page.goto("/");
  const header = page.getByRole("region", { name: "Encuentro de preparación" });
  await expect(header.getByText("Atlético Madrileño", { exact: true })).toBeVisible();
  await expect(header.getByText(/aplazado, pendiente de disputar sin nueva fecha confirmada/)).toBeVisible();
  await expect(page.getByText("Datos reales", { exact: true })).toBeVisible();
  const list = page.getByRole("list", { name: "Últimos partidos del rival" });
  await expect(list.getByRole("link")).toHaveCount(5);
  await expect(list.getByRole("link").first()).toHaveAttribute("href", "/matches/sofascore-match-106?view=observed&from=home&match=sofascore-match-9");
  // xG from each match's detail, from the rival's side: (0.5 + 1.25 + 0.5 + 1.25 + 0.5) / 5 and (1.25 · 3 + 0.5 · 2) / 5.
  const expectation = page.getByRole("term").filter({ hasText: "Expectativa" }).locator("xpath=following-sibling::dd");
  await expect(expectation).toHaveText(/0,80\s*xG\s*·\s*0,95\s*xG rival/);
  expect(await noHorizontalOverflow(page)).toBe(true);

  // A match opened here returns to this target.
  await list.getByRole("link").first().click();
  await page.getByRole("link", { name: "‹ Volver a Inicio" }).click();
  await expect(page).toHaveURL(/\/\?match=sofascore-match-9$/);
  await expect(header.getByText("Atlético Madrileño", { exact: true })).toBeVisible();

  // Another target: its rival and only its matches before that date.
  await page.getByRole("button", { name: "Cambiar rival" }).click();
  await page.getByRole("region", { name: "Próximos encuentros del Real Jaén" }).getByRole("button", { name: /Jornada 10/ }).click();
  await expect(page).toHaveURL(/\/\?match=sofascore-match-10$/);
  await expect(header.getByText("Algeciras CF", { exact: true })).toBeVisible();
  await expect(page.getByText("Todavía no hay partidos finalizados con fecha anterior al encuentro objetivo.")).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
  expect(synthetic).toEqual([]);
});
