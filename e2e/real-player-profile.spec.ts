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
  scope: "Datos personales según la fuente. No indican equipo actual.",
  source: { synthetic: false, label: "Datos reales" },
});
const PROFILES: Record<string, { status: number; body: unknown }> = {
  "sofascore-player-966303": { status: 200, body: profile({ id: "sofascore-player-966303", name: "Moha Keita",
    position: "midfielder", birthDate: "1999-09-18", heightCm: 165, preferredFoot: null, country: "Senegal" }) },
  "sofascore-player-1429049": { status: 200, body: profile({ id: "sofascore-player-1429049", name: "Jugador Sin Estatura",
    position: "midfielder", birthDate: "2000-08-24", heightCm: null, preferredFoot: null, country: null }) },
  "sofascore-player-1": { status: 404, body: { error: { code: "NOT_FOUND", message: "Jugador no encontrado en la fuente de datos." } } },
};

const missing = { value: null, reason: "not_available" };
const observedMatches = (playerId: string, matches: unknown[]) => ({
  playerId, matches, ratingSource: "SofaScore", source: { synthetic: false, label: "Datos reales" },
  scope: "Partidos en los que la fuente registra al jugador en la convocatoria. No garantiza cobertura completa ni indica equipo actual.",
});
const MOHA_MATCHES = observedMatches("sofascore-player-966303", [
  { match: { id: "sofascore-match-16599928", kickoff: "2026-10-18T16:15:00+00:00", status: "finished",
    competition: "Primera Federacion, Group 2", season: "26/27", round: 10,
    home: { id: "team-real-jaen", name: "Real Jaén" }, away: { id: "sofascore-team-1", name: "Rayo Majadahonda" },
    score: { home: 1, away: 0 } },
    side: "home", role: "starter", participation: "confirmed",
    stats: { minutes: { value: 90 }, goals: missing, assists: { value: 0 }, shots: { value: 2 }, xg: { value: 0.31 },
      passesCompleted: { value: 23 }, passes: { value: 29 }, rating: { value: 7 } } },
  { match: { id: "sofascore-match-16599388", kickoff: "2026-09-06T09:30:00+00:00", status: "finished",
    competition: "Primera Federacion, Group 2", season: "26/27", round: 2,
    home: { id: "team-real-jaen", name: "Real Jaén" }, away: { id: "sofascore-team-2", name: "Huesca" },
    score: { home: 2, away: 2 } },
    side: "home", role: "substitute", participation: "unknown",
    stats: { minutes: missing, goals: missing, assists: missing, shots: missing, xg: missing,
      passesCompleted: missing, passes: missing, rating: missing } },
]);

async function serveReal(page: Page, { profileDown = false, matchesDown = false } = {}) {
  await page.route("**/api/v1/teams/team-real-jaen/players", (route) => route.fulfill({ json: observed }));
  await page.route("**/api/v1/players/*/observed-matches", (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2)!);
    if (matchesDown) {
      return route.fulfill({ status: 503, json: { error: { code: "UPSTREAM_UNAVAILABLE", message: "La fuente de datos real no está disponible." } } });
    }
    return route.fulfill({ json: id === "sofascore-player-966303" ? MOHA_MATCHES : observedMatches(id, []) });
  });
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
  await expect(page.getByText(/Datos personales según la fuente. No indican equipo actual./)).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  const matches = page.getByRole("table", { name: "Partidos observados del jugador" });
  await expect(matches.getByRole("row")).toHaveCount(3);
  await expect(matches.getByRole("row").nth(1)).toContainText("vs Rayo Majadahonda");
  await expect(matches.getByRole("row").nth(1)).toContainText("23/29");
  await expect(matches.getByRole("row").nth(2)).toContainText("Participación no confirmada");
  await expect(matches.getByRole("columnheader", { name: /Val\. SofaScore/ })).toBeVisible();
  await expect(matches.getByRole("link")).toHaveCount(0);
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
  await expect(page.getByText("La fuente no tiene partidos observados de este jugador.")).toBeVisible();

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

test("Real players: failing matches keep the personal data and retry on their own", async ({ page }) => {
  await serveReal(page, { matchesDown: true });
  await page.goto("/players/sofascore-player-966303?view=profile");
  const section = page.getByRole("region", { name: /Partidos observados/ });
  await expect(section.getByRole("alert")).toContainText("No se pudieron cargar los partidos observados.");
  await expect(page.getByRole("heading", { level: 1, name: "Moha Keita" })).toBeVisible();
  await expect(page.getByText("Senegal")).toBeVisible();
  await page.unroute("**/api/v1/players/*/observed-matches");
  await serveReal(page);
  await section.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("table", { name: "Partidos observados del jugador" })).toBeVisible();
});
