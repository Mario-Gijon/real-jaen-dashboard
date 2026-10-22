import { expect, test, type Page } from "@playwright/test";

/*
 * «Equipos» with the real source (TEAMS_SOURCE=local). The e2e server is
 * synthetic, so these tests answer the browser's /api/v1 requests for the
 * real sections themselves: simulated responses, not the local API.
 */

const jaen = { id: "team-real-jaen", name: "Real Jaén" };
const rival = (n: number, name: string) => ({ id: `sofascore-team-${n}`, name });
const match = (round: number, home: { id: string; name: string }, away: { id: string; name: string }, score: [number, number]) => ({
  id: `sofascore-match-${round}`, kickoff: `2026-09-${String(round).padStart(2, "0")}T17:00:00+00:00`, status: "finished",
  competition: "Primera Federacion, Group 2", season: "26/27", round, home, away, score: { home: score[0], away: score[1] },
});
const results = [
  { match: match(1, rival(1, "CE Europa"), jaen, [0, 3]), side: "away", result: "win", goalsFor: 3, goalsAgainst: 0 },
  { match: match(2, jaen, rival(2, "Huesca"), [2, 2]), side: "home", result: "draw", goalsFor: 2, goalsAgainst: 2 },
  { match: match(5, rival(5, "Antequera"), jaen, [2, 0]), side: "away", result: "loss", goalsFor: 0, goalsAgainst: 2 },
];
const GROUP_2 = "sofascore-scope-94191-97382";
const INDICATORS = ["goals", "xg", "shots", "shotsOnTarget", "goalsAgainst", "xgAgainst", "shotsAgainst", "shotsOnTargetAgainst", "possession", "corners"];
const stat = (value: number | null, matches: number, of: number) => value === null
  ? { value: null, coverage: "none", reason: "not_available", matches: 0, of }
  : { value, coverage: matches === of ? "complete" : "partial", matches, of };
const averages = (of: number, values: Record<string, unknown>) =>
  Object.fromEntries(INDICATORS.map((key) => [key, values[key] ?? stat(null, 0, of)]));
/** As the source computes it: corners missing everywhere, xG in two of three matches. */
const output = {
  season: averages(3, { goals: stat(5 / 3, 3, 3), goalsAgainst: stat(4 / 3, 3, 3), xg: stat(1.42, 2, 3), xgAgainst: stat(1.1, 2, 3),
    shots: stat(11, 3, 3), shotsAgainst: stat(13, 3, 3), shotsOnTarget: stat(4, 3, 3), shotsOnTargetAgainst: stat(3, 3, 3),
    possession: stat(48.5, 2, 3) }),
  last3: { matchIds: results.map((r) => r.match.id), values: averages(3, { goals: stat(5 / 3, 3, 3), goalsAgainst: stat(4 / 3, 3, 3),
    xg: stat(1.42, 2, 3), xgAgainst: stat(1.1, 2, 3), shots: stat(11, 3, 3), shotsAgainst: stat(13, 3, 3),
    shotsOnTarget: stat(4, 3, 3), shotsOnTargetAgainst: stat(3, 3, 3), possession: stat(48.5, 2, 3) }) },
  undated: 0,
};
const performance = {
  teamId: "team-real-jaen", teams: [jaen], source: { synthetic: false, label: "Datos reales" },
  scope: "Resultados de los partidos finalizados observados en esta competición. No es necesariamente la temporada completa: sin clasificación ni puntos.",
  competitions: [{
    id: GROUP_2, name: "Primera Federación, Grupo 2", season: "26/27",
    matches: { inScope: 37, finished: 4, pending: 29, counted: 3, finishedWithoutValidScore: 1, unknownStatus: 0 },
    record: { played: 3, wins: 1, draws: 1, losses: 1, goalsFor: 5, goalsAgainst: 4, goalDifference: 1 },
    venues: { home: { win: 0, draw: 1, loss: 0 }, away: { win: 1, draw: 0, loss: 1 } },
    results,
    output,
  }],
};

async function serveReal(page: Page, realSections: string[] = ["teams", "matches"], { down = false } = {}) {
  await page.route("**/api/v1/source", (route) =>
    route.fulfill({ json: { synthetic: true, label: "Datos sintéticos y reales", realSections } }));
  await page.route("**/api/v1/teams/*/observed-performance", (route) => down
    ? route.fulfill({ status: 503, json: { error: { code: "UPSTREAM_UNAVAILABLE", message: "La fuente de datos real no está disponible." } } })
    : route.fulfill({ json: performance }));
}
const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("Equipos reales: balance, casa/fuera, resultados y partidos del ámbito, sin nada sintético", async ({ page }, testInfo) => {
  await serveReal(page);
  const synthetic: string[] = [];
  page.on("request", (r) => { if (/\/api\/v1\/(competitions|seasons\/)/.test(new URL(r.url()).pathname)) synthetic.push(r.url()); });
  await page.goto("/teams");
  await expect(page.getByRole("heading", { level: 2, name: "Real Jaén" })).toBeVisible();
  await expect(page.locator("header").getByText("Primera Federación, Grupo 2", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Competición" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Temporada" })).toHaveValue(GROUP_2);
  // The crest grid keeps its design (folded on phones) with the only team with correspondence.
  await expect(page.locator("input[type=radio]")).toHaveCount(1);

  const balance = page.getByLabel("Balance");
  await expect(balance).toContainText("DG+1");
  await expect(balance).toContainText("PJ3");
  await expect(page.getByText(/1 finalizado sin marcador válido no se incluye/)).toBeVisible();
  await expect(page.getByText(/Clasificación|Puntos/)).toHaveCount(0);
  // Production and concession from the source, with partial coverage marked and a missing value as «—».
  await expect(page.getByRole("heading", { name: "Rendimiento", exact: true })).toBeVisible();
  await expect(page.locator('[data-indicator="goals"]')).toHaveText("1,67");
  await expect(page.locator('[data-indicator="xg"]')).toHaveText("1,42*");
  await expect(page.locator('[data-indicator="corners"]')).toHaveText("—");
  await page.getByRole("button", { name: "Últimos 3" }).click();
  await expect(page.locator('[data-indicator="goals"]')).toContainText("±0,00 vs temporada");
  await expect(page.getByRole("table", { name: "Partidos disputados" }).locator("tr[data-in-period]")).toHaveCount(3);
  await page.getByRole("button", { name: "Temporada", exact: true }).click();
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("real-teams.png"), fullPage: true });

  // Keyboard: the result sequence names each result.
  const chips = page.getByRole("list", { name: "Resultados por jornada" }).getByRole("button");
  await chips.first().focus();
  await expect(page.locator("p[aria-live]")).toContainText("CE Europa");
  await page.keyboard.press("Tab");
  await expect(page.locator("p[aria-live]")).toContainText("Huesca");

  // Each played match opens its real detail.
  const table = page.getByRole("table", { name: "Partidos disputados" });
  await expect(table.getByRole("link")).toHaveCount(3);
  await expect(table.getByRole("link").first()).toHaveAttribute("href", "/matches/sofascore-match-5?view=observed");
  expect(synthetic).toEqual([]);
});

test("Equipos reales: sin partidos reales no hay enlaces; jugadores reales desactivados lo dicen", async ({ page }) => {
  await serveReal(page, ["teams"]);
  await page.goto("/teams");
  await expect(page.getByRole("table", { name: "Partidos disputados" }).getByRole("link")).toHaveCount(0);
  await page.getByRole("tab", { name: "Jugadores" }).click();
  await expect(page.getByText("La fuente real de jugadores no está activada.")).toBeVisible();
});

test("Equipos reales: un error tiene reintento y una temporada sintética no se sustituye", async ({ page }) => {
  await serveReal(page, ["teams"], { down: true });
  await page.goto("/teams");
  await expect(page.locator("main").getByRole("alert")).toContainText("No se pudieron cargar los datos reales del equipo.");
  await page.unroute("**/api/v1/teams/*/observed-performance");
  await serveReal(page, ["teams"]);
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByLabel("Balance")).toContainText("DG+1");

  await page.goto("/teams?season=season-demo-2026-27");
  await expect(page.getByText(/La temporada indicada no corresponde a la fuente real de equipos/)).toBeVisible();
  await page.getByRole("link", { name: "Ver la temporada real" }).click();
  await expect(page.getByLabel("Balance")).toBeVisible();
});
