import { expect, test, type Page } from "@playwright/test";

test("Team to player: reload preserves the team, season and players tab", async ({ page }) => {
  await page.goto("/teams?team=team-montealto&season=season-demo-2026-27&tab=players");
  await expect(page.getByRole("heading", { level: 2, name: "CD Montealto" })).toBeVisible();
  const table = page.getByRole("table", { name: "Jugadores de la plantilla" });
  await expect(table.getByRole("columnheader", { name: "Estatura" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Pierna" })).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const link = table.getByRole("link", { name: /Ver ficha de/ }).first();
  const href = (await link.getAttribute("href"))!;
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
  await page.reload();
  const back = page.getByRole("link", { name: "← Volver", exact: true });
  await expect(back).toHaveAttribute("href", "/teams?season=season-demo-2026-27&team=team-montealto&tab=players");
  await back.click();
  await expect(page.getByRole("heading", { level: 2, name: "CD Montealto" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Jugadores" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Team match row and match player links preserve their immediate origin", async ({ page }) => {
  await page.goto("/teams");
  const history = page.getByRole("table", { name: "Partidos disputados" });
  const row = history.locator("tbody tr").first();
  const matchId = (await row.getAttribute("data-match-id"))!;
  await row.locator("td").first().click();
  await expect(page).toHaveURL(new RegExp(`/matches/${matchId}$`));
  // A known finished match provides both lineups and timeline player names.
  for (const [tab, label] of [["lineups", "Alineaciones"], ["timeline", "Cronología"]] as const) {
    await page.goto(`/matches/match-r01-01?tab=${tab}`);
    await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
    const link = page.getByRole("tabpanel").getByRole("link").first();
    const href = (await link.getAttribute("href"))!;
    await expect(link).toHaveAttribute("href", new RegExp(`tab=matches&match=match-r01-01&from=match&origin=match-r01-01&originTab=${tab}$`));
    // Direct navigation to the link target also checks new-tab/history independence.
    await page.goto(href);
    const back = page.getByRole("link", { name: "← Volver", exact: true });
    await expect(back).toHaveAttribute("href", `/matches/match-r01-01?tab=${tab}`);
    await back.click();
    await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
  }
});

/** The selected match detail: side panel on desktop, inline under the history row on mobile. */
function matchDetail(page: Page, mobile: boolean) {
  return page.getByRole("region", { name: mobile ? "Detalle inline del partido" : "Detalle del partido" });
}

test("Match lineups to player opens Partidos on that match and returns to Alineaciones", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  await page.goto("/matches/match-r01-01");
  await page.getByRole("tab", { name: "Alineaciones" }).click();
  const starter = page.getByRole("list", { name: "Once inicial de Real Jaén CF" }).getByRole("link").first();
  await starter.click();
  await expect(page).toHaveURL(/\/players\/[^?]+\?season=[^&]+&tab=matches&match=match-r01-01&from=match&origin=match-r01-01&originTab=lineups$/);
  await expect(page.getByRole("tab", { name: "Partidos" })).toHaveAttribute("aria-selected", "true");
  const row = page.getByRole("list", { name: "Histórico de partidos" }).getByRole("button", { name: /^J1\D/ });
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Jornada 1 · / })).toHaveAttribute("aria-pressed", "true");
  await expect(matchDetail(page, mobile)).toBeVisible();
  await expect(matchDetail(page, mobile)).toContainText("J1 · vs");
  await expect(matchDetail(page, mobile).getByRole("link", { name: "Ver partido completo" })).toHaveAttribute("href", "/matches/match-r01-01");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Reload keeps the context from the URL.
  await page.reload();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "← Volver", exact: true }).click();
  await expect(page).toHaveURL(/\/matches\/match-r01-01\?tab=lineups$/);
  await expect(page.getByRole("tab", { name: "Alineaciones" })).toHaveAttribute("aria-selected", "true");
});

test("Match timeline to player opens Partidos on that match and returns to Cronología", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  await page.goto("/matches/match-r01-01?tab=timeline");
  await page.getByRole("tabpanel", { name: "Cronología" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/&tab=matches&match=match-r01-01&from=match&origin=match-r01-01&originTab=timeline$/);
  await expect(page.getByRole("tab", { name: "Partidos" })).toHaveAttribute("aria-selected", "true");
  await expect(matchDetail(page, mobile)).toContainText("J1 · vs");
  await page.getByRole("link", { name: "← Volver", exact: true }).click();
  await expect(page).toHaveURL(/\/matches\/match-r01-01\?tab=timeline$/);
  await expect(page.getByRole("tab", { name: "Cronología" })).toHaveAttribute("aria-selected", "true");
});

test("An unused substitute opens Partidos on the origin match as No participó", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  await page.goto("/matches/match-r01-01?tab=lineups");
  const unused = page.getByRole("list", { name: /^Banquillo de / }).getByRole("listitem")
    .filter({ hasNot: page.getByLabel(/^Entra en el minuto/) }).first().getByRole("link");
  await unused.click();
  await expect(page.getByRole("tab", { name: "Partidos" })).toHaveAttribute("aria-selected", "true");
  const detail = matchDetail(page, mobile);
  await expect(detail).toContainText("J1 · vs");
  await expect(detail).toContainText("No participó");
  await expect(detail).toContainText("Sin minutos ni estadísticas individuales en este partido.");
  await expect(detail.getByRole("definition")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Histórico de partidos" }).locator('[aria-current="true"]')).toContainText("J1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Direct player access opens Temporada and invalid match parameters select nothing", async ({ page }) => {
  await page.goto("/matches/match-r01-01?tab=lineups");
  const href = (await page.getByRole("list", { name: "Once inicial de Real Jaén CF" }).getByRole("link").first().getAttribute("href"))!;
  const base = href.split("&")[0];
  await page.goto(base);
  await expect(page.getByRole("tab", { name: "Temporada" })).toHaveAttribute("aria-selected", "true");
  await page.goto(`${base}&tab=unknown&match=match-r01-01`);
  await expect(page.getByRole("tab", { name: "Temporada" })).toHaveAttribute("aria-selected", "true");
  await page.goto(`${base}&tab=matches&match=match-missing`);
  await expect(page.getByRole("tab", { name: "Partidos" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("status")).toContainText("El partido indicado no figura entre los partidos finalizados");
  await expect(page.getByRole("list", { name: "Histórico de partidos" }).locator('[aria-pressed="true"], [aria-current="true"]')).toHaveCount(0);
});
