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
const KEYS = ["minutes", "goals", "assists", "shots", "shotsOnTarget", "xg", "passesCompleted", "passes", "dribbles", "dribblesWon",
  "recoveries", "possessionLost", "duelsWon", "duelsLost", "fouls", "saves", "rating"];
const stats = (values: Record<string, number> = {}) =>
  Object.fromEntries(KEYS.map((key) => [key, key in values ? { value: values[key] } : missing]));
const observedMatches = (playerId: string, matches: unknown[]) => ({
  playerId, matches, ratingSource: "SofaScore", source: { synthetic: false, label: "Datos reales" },
  scope: "Partidos en los que la fuente registra al jugador en la convocatoria. No garantiza cobertura completa ni indica equipo actual.",
});
const MOHA_MATCHES = observedMatches("sofascore-player-966303", [
  { match: { id: "sofascore-match-16599928", kickoff: "2026-10-18T16:15:00+00:00", status: "finished",
    competition: "Primera Federacion, Group 2", season: "26/27", round: 10,
    home: { id: "team-real-jaen", name: "Real Jaén" }, away: { id: "sofascore-team-1", name: "Rayo Majadahonda" },
    score: { home: 1, away: 0 } },
    side: "home", role: "starter", position: "midfielder", participation: "confirmed",
    stats: stats({ minutes: 90, assists: 0, shots: 2, shotsOnTarget: 0, xg: 0.31, passesCompleted: 23, passes: 29, rating: 7 }) },
  { match: { id: "sofascore-match-16599500", kickoff: "2026-09-20T16:00:00+00:00", status: "finished",
    competition: "Primera Federacion, Group 2", season: "26/27", round: 5,
    home: { id: "sofascore-team-3", name: "Antequera CF" }, away: { id: "team-real-jaen", name: "Real Jaén" },
    score: { home: 0, away: 2 } },
    side: "away", role: "substitute", position: "forward", participation: "confirmed",
    stats: stats({ minutes: 22, goals: 1, assists: 1, shots: 1, shotsOnTarget: 1, passes: 8, passesCompleted: 6, duelsWon: 3, rating: 7.6 }) },
  { match: { id: "sofascore-match-16599388", kickoff: "2026-09-06T09:30:00+00:00", status: "finished",
    competition: "Primera Federacion, Group 2", season: "26/27", round: 2,
    home: { id: "team-real-jaen", name: "Real Jaén" }, away: { id: "sofascore-team-2", name: "Huesca" },
    score: { home: 2, away: 2 } },
    side: "home", role: "substitute", position: "midfielder", participation: "unknown", stats: stats() },
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
  const history = page.getByRole("list", { name: "Histórico de partidos" });
  await expect(history.getByRole("button")).toHaveCount(3);
  await expect(history.getByRole("button").nth(0)).toContainText("Real Jaén · Rayo Majadahonda");
  await expect(history.getByRole("button").nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(history.getByRole("button").nth(2)).toContainText("Suplente · Participación no confirmada");
  // Synthetic source: no real match detail to link.
  await expect(page.getByRole("link", { name: "Ver partido completo" })).toHaveCount(0);
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
  const section = page.getByRole("region", { name: "Partidos" });
  await expect(section.getByRole("alert")).toContainText("No se pudieron cargar los partidos observados.");
  await expect(page.getByRole("heading", { level: 1, name: "Moha Keita" })).toBeVisible();
  await expect(page.getByText("Senegal")).toBeVisible();
  await page.unroute("**/api/v1/players/*/observed-matches");
  await serveReal(page);
  await section.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("list", { name: "Histórico de partidos" })).toBeVisible();
});

const RAYO = (MOHA_MATCHES.matches[0] as { match: { id: string } }).match;
const ANTEQUERA = (MOHA_MATCHES.matches[1] as { match: { id: string } }).match;
const lineupPlayer = (id: number, name: string, role = "starter") => ({
  player: { id: `sofascore-player-${id}`, name, position: "midfielder" }, shirtNumber: id % 100,
  role, participation: "confirmed", minutes: { value: 90 },
});
const RAYO_DETAIL = {
  match: RAYO, scope: "Partido, estadísticas colectivas, alineaciones e incidencias según la fuente.",
  source: { synthetic: false, label: "Datos reales" },
  statistics: { state: "not_stored", fetchedAt: null },
  incidents: { state: "not_stored", fetchedAt: null },
  lineups: { state: "stored", fetchedAt: "2026-10-21T12:07:31+00:00", confirmed: true,
    home: [lineupPlayer(966303, "Moha Keita"), ...Array.from({ length: 10 }, (_, i) => lineupPlayer(i + 1, `Jaén ${i + 1}`))],
    away: [lineupPlayer(1429049, "Jugador Sin Estatura"), ...Array.from({ length: 10 }, (_, i) => lineupPlayer(i + 20, `Rayo ${i + 20}`))] },
};

/** Real profiles and real matches both enabled; the match detail is simulated too. */
async function serveRealWithMatches(page: Page) {
  await serveReal(page);
  await page.route("**/api/v1/source", (route) =>
    route.fulfill({ json: { synthetic: true, label: "Datos sintéticos y reales", realSections: ["observedPlayers", "matches"] } }));
  await page.route("**/api/v1/matches/*/observed", (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2)!);
    return id === RAYO.id || id === ANTEQUERA.id
      ? route.fulfill({ json: { ...RAYO_DETAIL, match: id === RAYO.id ? RAYO : ANTEQUERA } })
      : route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Partido no encontrado en la fuente real de partidos." } } });
  });
}

const visibleDetail = (page: Page) => page.locator("#player-match-detail-panel:visible, #player-inline-detail:visible");
const metric = (page: Page, label: string) => visibleDetail(page).locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("+ dd");

test("Real players: Partidos master-detail, selection in place, kept on reload and on return from the match", async ({ page, context }, testInfo) => {
  await serveRealWithMatches(page);
  await page.goto("/teams?tab=players");
  await page.getByRole("table", { name: /Jugadores observados/ }).getByRole("link", { name: "Ver ficha de Moha Keita" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Moha Keita" })).toBeVisible();
  // From the profile to the match and back nothing synthetic is asked (the team view itself is).
  const synthetic: string[] = [];
  page.on("request", (r) => { if (/\/api\/v1\/(competitions|matches\/[^/]+$|players\/[^/]+$)/.test(new URL(r.url()).pathname)) synthetic.push(r.url()); });
  const history = page.getByRole("list", { name: "Histórico de partidos" });
  const rows = history.getByRole("button");

  // Default: the newest appearance, with real values, real zeros and missing values apart.
  await expect(rows.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(visibleDetail(page)).toContainText("Posición en el partido: Centrocampista · Valoración de SofaScore: 7,0");
  await expect(metric(page, "Pases")).toHaveText("29");
  await expect(metric(page, "Precisión de pase")).toHaveText("79,3 %");
  await expect(metric(page, "Tiros a puerta")).toHaveText("0");
  await expect(metric(page, "Goles")).toHaveText("—");
  await expect(metric(page, "Duelos ganados")).toHaveText("—");
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("real-profile-matches.png"), fullPage: true });

  // Keyboard: another match is selected in place, without leaving the profile.
  const profilePath = new URL(page.url()).pathname;
  await rows.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(rows.nth(1).getByLabel("1 gol")).toBeVisible();
  await expect(metric(page, "Goles")).toHaveText("1");
  await expect(metric(page, "Asistencias")).toHaveText("1");
  await expect(visibleDetail(page)).toContainText("Suplente · 22′");
  await expect(page).toHaveURL(/&match=sofascore-match-16599500$/);
  expect(new URL(page.url()).pathname).toBe(profilePath);

  // A call-up without confirmed participation: no minutes nor stats.
  await rows.nth(2).click();
  await expect(visibleDetail(page)).toContainText("Los datos no permiten confirmar su participación");
  await expect(visibleDetail(page).locator("dt")).toHaveCount(0);

  // Reload keeps the selection.
  await rows.nth(1).click();
  await page.reload();
  await expect(history.getByRole("button").nth(1)).toHaveAttribute("aria-pressed", "true");
  const profileUrl = page.url();

  // «Ver partido completo»: a real link (also in another tab) to the general detail, and back with the selection.
  const full = page.getByRole("link", { name: "Ver partido completo" });
  await expect(full).toHaveAttribute("href",
    /^\/matches\/sofascore-match-16599500\?view=observed&from=player&player=sofascore-player-966303&season=[^&]+&playerFrom=team&playerOrigin=team-real-jaen$/);
  const [other] = await Promise.all([context.waitForEvent("page"), full.click({ modifiers: ["ControlOrMeta"] })]);
  await expect(other).toHaveURL(/\/matches\/sofascore-match-16599500\?view=observed&from=player/);
  await other.close();
  await full.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Antequera CF contra Real Jaén" })).toBeVisible();
  await page.getByRole("link", { name: "‹ Volver al jugador" }).click();
  await expect(page).toHaveURL(profileUrl);
  await expect(page.getByRole("list", { name: "Histórico de partidos" }).getByRole("button").nth(1)).toHaveAttribute("aria-pressed", "true");
  expect(synthetic).toEqual([]);
  await page.getByRole("link", { name: "← Volver", exact: true }).click();
  await expect(page).toHaveURL(/\/teams\?season=[^&]+&team=team-real-jaen&tab=players$/);
  await expect(page.getByRole("tab", { name: "Jugadores" })).toHaveAttribute("aria-selected", "true");
});

test("Real players: from a match's line-ups the profile opens on that match; another player returns to the line-ups", async ({ page }) => {
  await serveRealWithMatches(page);
  // Opened from Huesca's line-ups (not the newest match): that match is selected.
  await page.goto("/players/sofascore-player-966303?view=profile&from=observedMatch&origin=sofascore-match-16599388&originTab=lineups");
  const rows = page.getByRole("list", { name: "Histórico de partidos" }).getByRole("button");
  await expect(rows.nth(2)).toHaveAttribute("aria-pressed", "true");
  await expect(rows.nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("link", { name: "← Volver", exact: true })).toHaveAttribute("href", "/matches/sofascore-match-16599388?view=observed&tab=lineups");

  await rows.nth(0).click();
  await page.getByRole("link", { name: "Ver partido completo" }).click();
  await page.getByRole("tab", { name: "Alineaciones" }).click();
  await page.getByRole("tabpanel", { name: "Alineaciones" }).getByRole("link", { name: "Jugador Sin Estatura" }).click();
  await expect(page).toHaveURL(/\/players\/sofascore-player-1429049\?view=profile&from=observedMatch&origin=sofascore-match-16599928&originTab=lineups$/);
  await page.getByRole("link", { name: "← Volver", exact: true }).click();
  await expect(page).toHaveURL(/\/matches\/sofascore-match-16599928\?view=observed&tab=lineups$/);
  await expect(page.getByRole("tab", { name: "Alineaciones" })).toHaveAttribute("aria-selected", "true");
  // One level only: the parameters never pile up.
  expect(page.url().length).toBeLessThan(120);
});

test("Real players: an unknown or tampered selection selects nothing and says so", async ({ page }) => {
  await serveRealWithMatches(page);
  for (const match of ["sofascore-match-404", "%2F%2Fexample.com"]) {
    await page.goto(`/players/sofascore-player-966303?view=profile&match=${match}`);
    const rows = page.getByRole("list", { name: "Histórico de partidos" }).getByRole("button");
    await expect(rows).toHaveCount(3);
    if (match === "sofascore-match-404") {
      await expect(page.getByText("El partido indicado no figura entre los partidos observados de este jugador.")).toBeVisible();
      await expect(page.locator("[aria-pressed=true]")).toHaveCount(0);
    } else {
      // Not a valid id: ignored, the default selection applies.
      await expect(rows.nth(0)).toHaveAttribute("aria-pressed", "true");
    }
  }
});

test("Real players: direct and tampered match links fall back to internal destinations", async ({ page }) => {
  await serveRealWithMatches(page);
  for (const player of ["%2F%2Fexample.com", "https%3A%2F%2Fexample.com", "..%2Fteams", ""]) {
    await page.goto(`/matches/sofascore-match-16599928?view=observed&from=player&player=${player}`);
    await expect(page.getByRole("link", { name: "‹ Volver a partidos" })).toHaveAttribute("href", "/matches");
  }
  await page.goto("/matches/sofascore-match-16599928?view=observed&from=player&player=sofascore-player-966303&season=..%2Fx&playerFrom=team&playerOrigin=%2F%2Fexample.com");
  await expect(page.getByRole("link", { name: "‹ Volver al jugador" }))
    .toHaveAttribute("href", "/players/sofascore-player-966303?view=profile&match=sofascore-match-16599928");
  await page.getByRole("link", { name: "‹ Volver al jugador" }).click();
  await page.getByRole("link", { name: "← Volver", exact: true }).click();
  await expect(page).toHaveURL(/\/teams\?tab=players$/);

  // An id the real source does not know keeps the way back to the profile.
  await page.goto("/matches/sofascore-match-999?view=observed&from=player&player=sofascore-player-966303");
  await expect(page.getByRole("heading", { name: "Partido no encontrado en la fuente real" })).toBeVisible();
  await expect(page.getByRole("link", { name: "‹ Volver al jugador" }))
    .toHaveAttribute("href", "/players/sofascore-player-966303?view=profile&match=sofascore-match-999");
});
