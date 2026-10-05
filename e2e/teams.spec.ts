import { expect, test, type Page } from "@playwright/test";

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("Equipos: Real Jaén by default, team change, tabs and player panel", async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name === "mobile";
  await page.goto("/teams");
  const grid = page.getByRole("group", { name: "Equipo" });
  await expect(page.getByRole("heading", { level: 2, name: "Real Jaén CF" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Rendimiento" })).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("teams-performance.png"), fullPage: true });

  // Phones fold the grid behind «Cambiar equipo»; desktop always shows it.
  const change = page.getByRole("button", { name: "Cambiar equipo" });
  if (phone) {
    await expect(grid).toBeHidden();
    await change.click();
    await expect(grid).toBeVisible();
    await expect(grid.getByRole("radio", { name: "Real Jaén" })).toBeFocused();
  } else {
    await expect(change).toBeHidden();
    await expect(grid).toBeVisible();
  }
  await expect(grid.getByRole("radio", { name: "Real Jaén" })).toBeChecked();
  await grid.getByText("Montealto").click();
  await expect(page.getByRole("heading", { level: 2, name: "CD Montealto" })).toBeVisible();
  if (phone) {
    await expect(grid).toBeHidden();
    await expect(change).toBeFocused();
  }

  await page.getByRole("tab", { name: "Jugadores" }).click();
  const table = page.getByRole("table", { name: "Jugadores de la plantilla" });
  await expect(table).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("teams-players.png"), fullPage: true });

  const first = table.getByRole("button", { name: /Ver ficha de/ }).first();
  const name = (await first.getAttribute("aria-label"))!.replace("Ver ficha de ", "");
  await first.click();
  const panel = page.getByRole("dialog", { name });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Pierna dominante")).toBeVisible();
  await expect(panel.getByRole("link", { name: /Ver ficha completa/ })).toHaveAttribute(
    "href",
    /\/players\/player-\d+\?season=/,
  );
  await page.screenshot({ path: testInfo.outputPath("teams-sheet.png") });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(first).toBeFocused();
});

test("Rendimiento: Temporada and Últimos 3 with the three matches highlighted", async ({
  page,
}, testInfo) => {
  await page.goto("/teams");
  const output = page.getByRole("region", { name: "Rendimiento" });
  await expect(output.getByRole("region", { name: "Ataque" })).toBeVisible();
  await expect(output.getByRole("region", { name: "Defensa" })).toBeVisible();
  await expect(output).not.toContainText("vs temporada");
  await page.screenshot({ path: testInfo.outputPath("rendimiento-temporada.png"), fullPage: true });

  await output.getByRole("button", { name: "Últimos 3" }).click();
  await expect(output).toContainText("vs temporada");
  const history = page.getByRole("table", { name: "Partidos disputados" });
  await expect(history.locator("tbody tr")).toHaveCount(13);
  await expect(history.locator("tbody tr[data-in-period]")).toHaveCount(3);
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath("rendimiento-ultimos3.png"), fullPage: true });
});
