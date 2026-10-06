import { expect, test } from "@playwright/test";

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
    await expect(link).toHaveAttribute("href", new RegExp(`from=match&origin=match-r01-01&tab=${tab}$`));
    // Direct navigation to the link target also checks new-tab/history independence.
    await page.goto(href);
    const back = page.getByRole("link", { name: "← Volver", exact: true });
    await expect(back).toHaveAttribute("href", `/matches/match-r01-01?tab=${tab}`);
    await back.click();
    await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
  }
});
