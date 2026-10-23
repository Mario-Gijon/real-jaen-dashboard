import { expect, test, type Page } from "@playwright/test";

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("Equipos: Real Jaén by default, team change, tabs and direct player navigation", async ({
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
    await expect(grid.getByRole("radio", { name: "Real Jaén CF" })).toBeFocused();
  } else {
    await expect(change).toBeHidden();
    await expect(grid).toBeVisible();
  }
  await expect(grid.getByRole("radio", { name: "Real Jaén CF" })).toBeChecked();
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

  const first = table.getByRole("link", { name: /Ver ficha de/ }).first();
  const name = (await first.getAttribute("aria-label"))!.replace("Ver ficha de ", "");
  await first.click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "\u2190 Volver", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "CD Montealto" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Jugadores" })).toHaveAttribute("aria-selected", "true");
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

test("Evolución: the result chips stay on one line and scroll sideways if needed", async ({
  page,
}) => {
  await page.goto("/teams");
  const sequence = page.getByRole("list", { name: "Resultados por jornada" });
  const chips = sequence.getByRole("button");
  await expect(chips).toHaveCount(13);
  const first = (await chips.first().boundingBox())!;
  const last = (await chips.last().boundingBox())!;
  expect(Math.abs(first.y - last.y)).toBeLessThan(1);
  // The latest result is in view and the detail line still follows the selection.
  await expect(chips.last()).toBeInViewport();
  await chips.first().focus();
  await expect(chips.first()).toBeInViewport();
  await expect(page.getByText("CF Peñalbar", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
