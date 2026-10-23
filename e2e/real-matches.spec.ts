import { expect, test, type Page } from "@playwright/test";
import { REAL_SOURCE } from "./sources";

/*
 * «Partidos» with the real source. The e2e server is synthetic, so these tests
 * answer the browser's /api/v1 requests for the real section themselves:
 * simulated responses, not the local API.
 */

const jaen = { id: "team-real-jaen", name: "Real Jaén" };
const match = (id: string, fields: Record<string, unknown>) => ({
  id, kickoff: "2026-08-30T17:15:00+00:00", status: "finished", competition: "Primera Federacion, Group 2",
  season: "26/27", round: 1, home: { id: "sofascore-team-1", name: "CE Europa" }, away: jaen,
  score: { home: 0, away: 3 }, ...fields,
});
const MATCHES = [
  match("sofascore-match-1", {}),
  match("sofascore-match-2", { kickoff: "2026-10-03T11:00:00+00:00", round: 6, home: { id: "sofascore-team-2", name: "Hércules CF" }, score: { home: 0, away: 0 } }),
  match("sofascore-match-3", { kickoff: "2026-10-28T19:00:00+00:00", status: "scheduled", round: 9, home: { id: "sofascore-team-3", name: "Antequera CF" }, score: null }),
  match("sofascore-match-4", { kickoff: "2026-11-02T17:15:00+00:00", status: "scheduled", round: 10, home: jaen, away: { id: "sofascore-team-4", name: "Atlético Sanluqueño" }, score: null }),
];
const body = {
  teamId: "team-real-jaen", source: { synthetic: false, label: "Datos reales" },
  scope: "Partidos del equipo que registra la fuente. No es necesariamente un calendario completo.",
  // This version's real source serves a single competition.
  competitions: [{ name: "Primera Federación, Grupo 2", season: "26/27" }],
  matches: MATCHES.map((m) => ({ match: m, side: m.home.id === jaen.id ? "home" : "away" })),
};

async function serveReal(page: Page, { down = false } = {}) {
  await page.route("**/api/v1/source", (route) =>
    route.fulfill({ json: REAL_SOURCE }));
  await page.route("**/api/v1/teams/*/observed-matches", (route) => down
    ? route.fulfill({ status: 503, json: { error: { code: "UPSTREAM_UNAVAILABLE", message: "La fuente de datos real no está disponible." } } })
    : route.fulfill({ json: body }));
}
const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("Partidos reales: finished and pending, filters, coverage and links to the real detail only", async ({ page }, testInfo) => {
  await serveReal(page);
  const synthetic: string[] = [];
  page.on("request", (r) => { if (/\/api\/v1\/(competitions|seasons\/)/.test(r.url())) synthetic.push(r.url()); });
  await page.goto("/matches");
  const list = page.getByRole("list", { name: "Partidos reales" });
  await expect(list.getByRole("listitem")).toHaveCount(4);
  await expect(page.getByText("Datos reales", { exact: true })).toBeVisible();
  await expect(page.getByText(/No es necesariamente un calendario completo/)).toBeVisible();
  await expect(list.getByRole("listitem").nth(1)).toContainText("0 – 0");
  await expect(list.getByRole("listitem").nth(2)).toContainText("Programado");
  await expect(list.getByRole("listitem").nth(2)).not.toContainText("0 – 0");
  await expect(list.getByRole("link")).toHaveCount(4);
  await expect(list.getByRole("link").first()).toHaveAttribute("href", "/matches/sofascore-match-1?view=observed");
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("real-matches.png"), fullPage: true });

  // A single competition: named, not offered; the seasons stay the source's.
  await expect(page.getByRole("combobox", { name: "Competición" })).toHaveCount(0);
  await expect(page.locator("header").getByText("Primera Federación, Grupo 2")).toBeVisible();
  await expect(page.getByText(/Copa del Rey/)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Temporada" }).locator("option")).toHaveText(["Todas", "26/27"]);
  await page.getByRole("combobox", { name: "Estado" }).selectOption("pending");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  expect(synthetic).toEqual([]);
});

test("Partidos reales: an unavailable source shows an error with retry", async ({ page }) => {
  await serveReal(page, { down: true });
  await page.goto("/matches");
  await expect(page.locator("main").getByRole("alert")).toContainText("No se pudieron cargar los partidos reales.");
  await page.unroute("**/api/v1/teams/*/observed-matches");
  await serveReal(page);
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("list", { name: "Partidos reales" }).getByRole("listitem")).toHaveCount(4);
});

test("Partidos reales: a synthetic season or rival from a link is not swapped silently", async ({ page }) => {
  await serveReal(page);
  await page.goto("/matches?season=season-demo-2026-27&team=team-montealto&round=all");
  await expect(page.getByText(/La temporada seleccionada no corresponde a la fuente real de partidos/)).toBeVisible();
  await page.getByRole("link", { name: "Ver los partidos reales del Real Jaén" }).click();
  await expect(page.getByRole("list", { name: "Partidos reales" }).getByRole("listitem")).toHaveCount(4);
});

const missing = { value: null, reason: "not_available" };
const side = (values: Record<string, number>) => Object.fromEntries(
  ["possession", "shots", "shotsOnTarget", "xg", "corners", "fouls", "yellowCards", "redCards"].map((k) => [k, k in values ? { value: values[k] } : missing]));
const DETAIL = {
  match: MATCHES[0], scope: "Partido y estadísticas colectivas según la fuente. Un dato que la fuente no da se muestra como «—».",
  source: { synthetic: false, label: "Datos reales" },
  statistics: { state: "stored", fetchedAt: "2026-10-21T12:07:30+00:00",
    home: side({ possession: 46, shots: 15, shotsOnTarget: 4, xg: 1.81, corners: 3, fouls: 13, yellowCards: 0 }),
    away: side({ possession: 54, shots: 13, shotsOnTarget: 5, xg: 1.6, corners: 3, fouls: 5, yellowCards: 1 }) },
  lineups: { state: "not_stored", fetchedAt: null } as Record<string, unknown>,
  incidents: { state: "not_stored", fetchedAt: null } as Record<string, unknown>,
};
const ref = (id: number, name: string) => ({ id: `sofascore-player-${id}`, name, position: null });
const INCIDENTS = {
  state: "stored", fetchedAt: "2026-10-21T12:07:31+00:00",
  goals: [
    { kind: "regular", minute: 20, addedTime: null, scorer: ref(40, "Jaén 40"), assist: ref(41, "Jaén 41") },
    { kind: "penalty", minute: 80, addedTime: null, scorer: ref(40, "Jaén 40"), assist: null },
  ],
  substitutions: [{ minute: 68, addedTime: null, playerIn: ref(966303, "Moha Keita"), playerOut: ref(45, "Jaén 45") }],
};
const lineupPlayer = (id: number, name: string, fields: Record<string, unknown> = {}) => ({
  player: { id: `sofascore-player-${id}`, name, position: "midfielder" }, shirtNumber: id,
  role: "starter", participation: "confirmed", minutes: { value: 90 }, ...fields,
});
const LINEUPS = {
  state: "stored", fetchedAt: "2026-10-21T12:07:31+00:00", confirmed: true,
  home: [...Array.from({ length: 11 }, (_, i) => lineupPlayer(i + 1, `Local ${i + 1}`)),
    lineupPlayer(30, "Suplente Sin Jugar", { role: "substitute", participation: "unknown", minutes: missing })],
  away: [...Array.from({ length: 11 }, (_, i) => lineupPlayer(i + 40, `Jaén ${i + 40}`)),
    lineupPlayer(966303, "Moha Keita", { role: "substitute", minutes: { value: 22 } })],
};

async function serveDetail(page: Page, statistics: Record<string, unknown> = DETAIL.statistics,
  lineups: Record<string, unknown> = DETAIL.lineups, incidents: Record<string, unknown> = DETAIL.incidents) {
  await serveReal(page);
  await page.route("**/api/v1/matches/*/observed", (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2)!);
    return id === "sofascore-match-1"
      ? route.fulfill({ json: { ...DETAIL, statistics, lineups, incidents } })
      : route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Partido no encontrado en la fuente real de partidos." } } });
  });
}

test("Partido real: from the list to its detail with team stats, unknown red cards and back", async ({ page }, testInfo) => {
  await serveDetail(page);
  const synthetic: string[] = [];
  page.on("request", (r) => { if (/\/api\/v1\/(competitions|matches\/[^/]+$)/.test(new URL(r.url()).pathname)) synthetic.push(r.url()); });
  await page.goto("/matches");
  await page.getByRole("list", { name: "Partidos reales" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/matches\/sofascore-match-1\?view=observed$/);
  await expect(page.getByText("0 – 3")).toBeVisible();
  await expect(page.getByText("Primera Federacion, Group 2 · 26/27")).toBeVisible();
  await expect(page.getByText("Datos reales", { exact: true })).toBeVisible();
  const reds = page.locator("dt", { hasText: "Rojas" }).locator("..");
  await expect(reds.locator("dd").nth(0)).toHaveText("—");
  await expect(reds.locator("dd").nth(1)).toHaveText("—");
  await expect(page.locator("dt", { hasText: "Amarillas" }).locator("..").locator("dd").nth(0)).toHaveText("0");
  await expect(page.getByRole("tab")).toHaveText(["Resumen", "Alineaciones"]);
  await expect(page.getByRole("tab", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("real-match-detail.png"), fullPage: true });
  expect(synthetic).toEqual([]);
  await page.getByRole("link", { name: "‹ Volver a partidos" }).click();
  await expect(page.getByRole("list", { name: "Partidos reales" })).toBeVisible();
});

test("Partido real: an excluded match (Copa del Rey) cannot be opened by its id, nor its sections", async ({ page }) => {
  await serveDetail(page);
  for (const url of ["/matches/sofascore-match-17259821?view=observed", "/matches/sofascore-match-17259821?view=observed&tab=lineups"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Partido no encontrado en la fuente real" })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "‹ Volver a partidos" })).toBeVisible();
  }
});

test("Partido real: statistics not stored or failing, and an id unknown to the real source", async ({ page }) => {
  await serveDetail(page, { state: "not_stored", fetchedAt: null });
  await page.goto("/matches/sofascore-match-1?view=observed");
  await expect(page.getByText("La fuente no tiene estadísticas guardadas de este partido.")).toBeVisible();

  await page.unroute("**/api/v1/matches/*/observed");
  await serveDetail(page, { state: "error", fetchedAt: null });
  await page.reload();
  await expect(page.locator("main").getByRole("alert")).toContainText("No se pudieron cargar las estadísticas de este partido.");
  await expect(page.getByText("0 – 3")).toBeVisible();

  await page.goto("/matches/match-r01-01?view=observed");
  await expect(page.getByRole("heading", { name: "Partido no encontrado en la fuente real" })).toBeVisible();
});

test("Alineaciones reales: tab with once inicial and banquillo, recorded marks, real profile and back to the tab", async ({ page }, testInfo) => {
  await serveDetail(page, DETAIL.statistics, LINEUPS, INCIDENTS);
  // Real profiles enabled too, so names link to them; the profile itself is simulated as well.
  await page.route("**/api/v1/source", (route) =>
    route.fulfill({ json: REAL_SOURCE }));
  await page.route("**/api/v1/players/*/profile", (route) => route.fulfill({ json: {
    player: { id: "sofascore-player-966303", name: "Moha Keita", position: "midfielder", birthDate: "1999-09-18", heightCm: 165, preferredFoot: null, country: "Senegal" },
    scope: "Datos personales según la fuente. No indican equipo actual.", source: { synthetic: false, label: "Datos reales" } } }));
  await page.route("**/api/v1/players/*/observed-matches", (route) => route.fulfill({ json: {
    playerId: "sofascore-player-966303", matches: [], scope: "—", ratingSource: "SofaScore", source: { synthetic: false, label: "Datos reales" } } }));
  const synthetic: string[] = [];
  page.on("request", (r) => { if (/\/api\/v1\/(competitions|matches\/[^/]+$|players\/[^/]+$)/.test(new URL(r.url()).pathname)) synthetic.push(r.url()); });

  await page.goto("/matches/sofascore-match-1?view=observed");
  await page.getByRole("tab", { name: "Alineaciones" }).click();
  const lineups = page.getByRole("tabpanel", { name: "Alineaciones" });
  await expect(lineups.getByText("Alineaciones confirmadas por la fuente.")).toBeVisible();
  await expect(lineups.getByRole("list", { name: "Once inicial de CE Europa" }).getByRole("listitem")).toHaveCount(11);
  await expect(lineups.getByRole("list", { name: "Banquillo de CE Europa" })).toContainText("Participación no confirmada");
  const jaen = lineups.getByRole("list", { name: "Once inicial de Real Jaén" });
  await expect(jaen.getByRole("img", { name: "2 goles (1 de penalti)" })).toBeVisible();
  await expect(jaen.getByRole("img", { name: "1 asistencia" })).toBeVisible();
  await expect(jaen.getByRole("img", { name: "Sustituido en el minuto 68′" })).toBeVisible();
  await expect(lineups.getByRole("list", { name: "Banquillo de Real Jaén" })).toContainText("68′Sale · Jaén 45");
  await expect(lineups.getByText(/4-4-2|Formación/)).toHaveCount(0);
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("real-lineups.png"), fullPage: true });

  await lineups.getByRole("link", { name: "Moha Keita" }).click();
  await expect(page).toHaveURL(/\/players\/sofascore-player-966303\?view=profile&from=observedMatch&origin=sofascore-match-1&originTab=lineups$/);
  await expect(page.getByRole("heading", { level: 1, name: "Moha Keita" })).toBeVisible();
  await page.getByRole("link", { name: "← Volver", exact: true }).click();
  await expect(page).toHaveURL(/\/matches\/sofascore-match-1\?view=observed&tab=lineups$/);
  await expect(page.getByRole("tab", { name: "Alineaciones" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Alineaciones" })).toBeVisible();
  expect(synthetic).toEqual([]);
});

test("Alineaciones reales: failed incidents keep line-ups and stats; failed line-ups recover on the same tab", async ({ page }) => {
  await serveDetail(page, DETAIL.statistics, LINEUPS, { state: "error", fetchedAt: null });
  await page.goto("/matches/sofascore-match-1?view=observed&tab=lineups");
  const lineups = page.getByRole("tabpanel", { name: "Alineaciones" });
  await expect(lineups.getByRole("alert")).toContainText("No se pudieron cargar las incidencias");
  await expect(lineups.getByRole("list", { name: "Once inicial de Real Jaén" }).getByRole("img")).toHaveCount(0);

  await page.unroute("**/api/v1/matches/*/observed");
  await serveDetail(page, DETAIL.statistics, { state: "error", fetchedAt: null }, INCIDENTS);
  await page.reload();
  await expect(lineups.getByRole("alert")).toContainText("No se pudieron cargar las alineaciones de este partido.");
  await expect(page.getByText("0 – 3")).toBeVisible();

  await page.unroute("**/api/v1/matches/*/observed");
  await serveDetail(page, DETAIL.statistics, { ...LINEUPS, away: LINEUPS.away.slice(0, 9) }, INCIDENTS);
  await lineups.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("tab", { name: "Alineaciones" })).toHaveAttribute("aria-selected", "true");
  await expect(lineups.getByText("Alineación incompleta en la fuente: 9 titulares.")).toBeVisible();
  await page.getByRole("tab", { name: "Resumen" }).click();
  await expect(page.locator("dt", { hasText: "Posesión" })).toBeVisible();
});
