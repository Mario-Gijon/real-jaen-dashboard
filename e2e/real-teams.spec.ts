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

const figure = (value: number | null, matches: number, of: number) => stat(value, matches, of);
/** As the service accumulates them: a starter, a player with one call-up it could not resolve and a substitute never used. */
const squad = {
  teamId: "team-real-jaen", source: { synthetic: false, label: "Datos reales" },
  scope: "Jugadores observados en las convocatorias de los partidos finalizados disponibles de esta competición. No garantiza toda la temporada ni es una plantilla completa o necesariamente actual.",
  competitions: [{
    id: GROUP_2, name: "Primera Federación, Grupo 2", season: "26/27", matches: { counted: 3, withCallUps: 3 },
    callUps: { total: 9, played: 5, unused: 3, unknown: 1, contradictions: 0, mismatches: 0, teamWarnings: 0, duplicateRecords: 0,
      discardedRecords: 0 },
    players: [
      { player: { id: "sofascore-player-942663", name: "Marco Siverio Toro", position: "forward" }, heightCm: 184, preferredFoot: null,
        lastShirtNumber: 9, callUps: 3, stats: { appearances: figure(3, 3, 3), starts: figure(3, 3, 3), minutes: figure(250, 3, 3),
          goals: figure(2, 3, 3), assists: figure(0, 3, 3) } },
      { player: { id: "sofascore-player-966303", name: "Moha Keita", position: "midfielder" }, heightCm: 165, preferredFoot: "right",
        lastShirtNumber: 19, callUps: 3, stats: { appearances: figure(2, 2, 3), starts: figure(1, 3, 3), minutes: figure(110, 2, 3),
          goals: figure(1, 2, 3), assists: figure(1, 2, 3) } },
      { player: { id: "sofascore-player-1086428", name: "Salvi", position: "goalkeeper" }, heightCm: 190, preferredFoot: null,
        lastShirtNumber: 13, callUps: 3, stats: { appearances: figure(0, 3, 3), starts: figure(0, 3, 3), minutes: figure(0, 3, 3),
          goals: figure(0, 3, 3), assists: figure(0, 3, 3) } },
    ],
  }],
};
const realProfile = {
  player: { id: "sofascore-player-966303", name: "Moha Keita", position: "midfielder", birthDate: "1999-09-18", heightCm: 165,
    preferredFoot: "right", country: "Senegal" },
  scope: "Datos personales según la fuente. No indican equipo actual.", source: { synthetic: false, label: "Datos reales" },
};

test("Equipos reales: jugadores con acumulados reales, orden, filtro, ficha y vuelta", async ({ page }, testInfo) => {
  await serveReal(page, ["teams", "observedPlayers"]);
  await page.route("**/api/v1/teams/*/observed-squad", (route) => route.fulfill({ json: squad }));
  await page.route("**/api/v1/players/*/profile", (route) => route.fulfill({ json: realProfile }));
  await page.route("**/api/v1/players/*/observed-matches", (route) => route.fulfill({ json: {
    playerId: "sofascore-player-966303", matches: [], ratingSource: "SofaScore", source: { synthetic: false, label: "Datos reales" },
    scope: "Partidos en los que la fuente registra al jugador en la convocatoria." } }));
  const perPlayer: string[] = [];
  page.on("request", (r) => { if (/\/api\/v1\/(players\/[^/]+$|teams\/[^/]+\/players$|seasons\/)/.test(new URL(r.url()).pathname)) perPlayer.push(r.url()); });

  await page.goto("/teams?tab=players");
  const table = page.getByRole("table", { name: "Jugadores observados" });
  await expect(table).toBeVisible();
  const row = (name: string) => table.getByRole("row").filter({ has: page.getByRole("link", { name: `Ver ficha de ${name}` }) });
  await expect(row("Marco Siverio Toro").locator("td").nth(4)).toHaveText("2");
  await expect(row("Moha Keita").locator("td").nth(1)).toContainText("2*");
  await expect(row("Salvi").locator("td").nth(1)).toHaveText("0");
  await expect(row("Salvi").locator("td").nth(2)).toHaveText("0");
  await expect(row("Salvi").locator("td").nth(3)).toHaveText("0");
  await expect(row("Moha Keita").locator("td").nth(6)).toHaveText("165 cm");
  await expect(page.getByText(/^1 convocatoria sin participación resuelta; esas cifras llevan \*/)).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("real-teams-players.png"), fullPage: true });

  // Keyboard: sort by goals (complete first, then partial, then missing) and filter by line.
  const goals = page.getByRole("columnheader", { name: /^Goles|^G/ });
  await goals.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(goals).toHaveAttribute("aria-sort", "descending");
  const names = () => table.getByRole("link").evaluateAll((links) => links.map((l) => l.getAttribute("aria-label")!.replace("Ver ficha de ", "")));
  expect(await names()).toEqual(["Marco Siverio Toro", "Salvi", "Moha Keita"]);
  await page.getByRole("button", { name: /^Porteros/ }).focus();
  await page.keyboard.press("Enter");
  expect(await names()).toEqual(["Salvi"]);
  await page.getByRole("button", { name: /^Todos/ }).click();

  // The real profile, and back to this real season and tab.
  await row("Moha Keita").getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/players/sofascore-player-966303[?]view=profile&season=${GROUP_2}&from=team&origin=team-real-jaen`));
  await expect(page.getByRole("heading", { name: "Moha Keita" })).toBeVisible();
  await page.getByRole("link", { name: "← Volver", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/teams[?]season=${GROUP_2}&team=team-real-jaen&tab=players`));
  await expect(page.getByRole("table", { name: "Jugadores observados" })).toBeVisible();
  expect(perPlayer).toEqual([]);
});

test("Equipos reales: un fallo de los acumulados tiene reintento, sin jugadores sintéticos", async ({ page }) => {
  await serveReal(page, ["teams", "observedPlayers"]);
  let down = true;
  await page.route("**/api/v1/teams/*/observed-squad", (route) => down
    ? route.fulfill({ status: 503, json: { error: { code: "UPSTREAM_UNAVAILABLE", message: "La fuente de datos real no está disponible." } } })
    : route.fulfill({ json: squad }));
  await page.goto("/teams?tab=players");
  await expect(page.locator("main").getByRole("alert")).toContainText("La fuente de datos real no está disponible.");
  await expect(page.getByRole("table", { name: /Jugadores/ })).toHaveCount(0);
  down = false;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("table", { name: "Jugadores observados" })).toBeVisible();
});
