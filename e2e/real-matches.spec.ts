import { expect, test, type Page } from "@playwright/test";

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
  match("sofascore-match-3", { kickoff: "2026-10-28T19:00:00+00:00", status: "scheduled", competition: "Copa del Rey", home: { id: "sofascore-team-3", name: "CD Rival Copa" }, score: null }),
  match("sofascore-match-4", { kickoff: "2026-11-02T17:15:00+00:00", status: "scheduled", round: 10, home: jaen, away: { id: "sofascore-team-4", name: "Atlético Sanluqueño" }, score: null }),
];
const body = {
  teamId: "team-real-jaen", source: { synthetic: false, label: "Datos reales" },
  scope: "Partidos del equipo que registra la fuente. No es necesariamente un calendario completo.",
  matches: MATCHES.map((m) => ({ match: m, side: m.home.id === jaen.id ? "home" : "away" })),
};

async function serveReal(page: Page, { down = false } = {}) {
  await page.route("**/api/v1/source", (route) =>
    route.fulfill({ json: { synthetic: true, label: "Datos sintéticos y reales", realSections: ["matches"] } }));
  await page.route("**/api/v1/teams/*/observed-matches", (route) => down
    ? route.fulfill({ status: 503, json: { error: { code: "UPSTREAM_UNAVAILABLE", message: "La fuente de datos real no está disponible." } } })
    : route.fulfill({ json: body }));
}
const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("Partidos reales: finished and pending, filters, coverage and no links", async ({ page }, testInfo) => {
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
  await expect(list.getByRole("link")).toHaveCount(0);
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("real-matches.png"), fullPage: true });

  await page.getByRole("combobox", { name: "Estado" }).selectOption("pending");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Competición" }).selectOption("Copa del Rey");
  await expect(list.getByRole("listitem")).toHaveCount(1);
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
