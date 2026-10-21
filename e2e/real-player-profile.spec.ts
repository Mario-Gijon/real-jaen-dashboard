import { expect, test, type Page } from "@playwright/test";

/*
 * Navigation from the real observed players to a real profile. The e2e server
 * is synthetic, so these tests answer the browser's /api/v1 requests for the
 * real sections themselves: simulated responses, not the local API.
 */

const SCOPE = "Jugadores observados en convocatorias; no es una plantilla completa ni necesariamente actual.";
const observed = {
  teamId: "team-real-jaen",
  players: [
    { id: "sofascore-player-966303", name: "Moha Keita", position: "midfielder" },
    { id: "sofascore-player-1429049", name: "Jugador Sin Estatura", position: "midfielder" },
    { id: "sofascore-player-1", name: "Jugador Inexistente", position: null },
  ],
  scope: SCOPE,
  source: { synthetic: false, label: "Datos reales" },
};
const profile = (player: Record<string, unknown>) => ({
  player,
  scope: "Datos personales según la fuente. No indican equipo actual, temporada ni estadísticas.",
  source: { synthetic: false, label: "Datos reales" },
});
const PROFILES: Record<string, { status: number; body: unknown }> = {
  "sofascore-player-966303": { status: 200, body: profile({ id: "sofascore-player-966303", name: "Moha Keita",
    position: "midfielder", birthDate: "1999-09-18", heightCm: 165, preferredFoot: null, country: "Senegal" }) },
  "sofascore-player-1429049": { status: 200, body: profile({ id: "sofascore-player-1429049", name: "Jugador Sin Estatura",
    position: "midfielder", birthDate: "2000-08-24", heightCm: null, preferredFoot: null, country: null }) },
  "sofascore-player-1": { status: 404, body: { error: { code: "NOT_FOUND", message: "Jugador no encontrado en la fuente de datos." } } },
};

async function serveReal(page: Page, { profileDown = false } = {}) {
  await page.route("**/api/v1/teams/team-real-jaen/players", (route) => route.fulfill({ json: observed }));
  await page.route("**/api/v1/players/*/profile", (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2)!);
    if (profileDown) {
      return route.fulfill({ status: 503, json: { error: { code: "UPSTREAM_UNAVAILABLE", message: "La fuente de datos real no está disponible." } } });
    }
    const answer = PROFILES[id];
    return route.fulfill({ status: answer.status, json: answer.body });
  });
}

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("Real players: list to profile, personal data with provenance and back", async ({ page }, testInfo) => {
  await serveReal(page);
  const synthetic: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/v1\/players\/[^/]+(\?|$)/.test(request.url())) synthetic.push(request.url());
  });
  await page.goto("/teams?tab=players");
  const table = page.getByRole("table", { name: /Jugadores observados/ });
  await expect(table).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);

  await table.getByRole("link", { name: "Ver ficha de Moha Keita" }).click();
  await expect(page).toHaveURL(/\/players\/sofascore-player-966303\?view=profile&season=[^&]+&from=team&origin=team-real-jaen$/);
  await expect(page.getByRole("heading", { level: 1, name: "Moha Keita" })).toBeVisible();
  await expect(page.getByText("Senegal")).toBeVisible();
  await expect(page.getByText("1,65 m")).toBeVisible();
  await expect(page.getByText("Datos reales", { exact: true })).toBeVisible();
  await expect(page.getByText(/No indican equipo actual, temporada ni estadísticas/)).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("real-profile.png"), fullPage: true });
  // The real profile never asks for a synthetic season profile.
  expect(synthetic).toEqual([]);

  await page.getByRole("link", { name: "← Volver", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Jugadores" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("table", { name: /Jugadores observados/ })).toBeVisible();
});

test("Real players: unknown fields read «—» and a missing player has its own state", async ({ page }) => {
  await serveReal(page);
  await page.goto("/players/sofascore-player-1429049?view=profile");
  await expect(page.getByRole("heading", { level: 1, name: "Jugador Sin Estatura" })).toBeVisible();
  for (const label of ["Estatura", "Pierna dominante", "País"]) {
    await expect(page.locator("dt", { hasText: label }).locator("+ dd")).toHaveText("—");
  }

  await page.goto("/players/sofascore-player-1?view=profile");
  await expect(page.locator("main").getByRole("alert")).toContainText("Jugador no encontrado");
  await expect(page.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
});

test("Real players: an unavailable source shows an error with retry", async ({ page }) => {
  await serveReal(page, { profileDown: true });
  await page.goto("/players/sofascore-player-966303?view=profile");
  await expect(page.locator("main").getByRole("alert")).toContainText("La fuente de datos real no está disponible.");
  await page.unroute("**/api/v1/players/*/profile");
  await serveReal(page);
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Moha Keita" })).toBeVisible();
});
