import { expect, test } from "@playwright/test";

test("Home changes preparation context by keyboard and opens a recent match", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Preparación de rival", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
  const trigger = page.getByRole("button", { name: "Cambiar rival" });
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const options = page.getByRole("region", { name: "Próximos encuentros del Real Jaén" }).getByRole("button");
  await expect(options).toHaveCount(6);
  const opponent = (await options.nth(1).locator("strong").innerText()).split(" · ")[1];
  await expect(options.first()).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?season=[^&]+&match=/);
  await expect(page.getByRole("region", { name: "Encuentro de preparación" }).getByText(opponent, { exact: true })).toBeVisible();
  await expect(trigger).toBeFocused();
  const url = page.url();
  await page.reload();
  await expect(page.getByRole("region", { name: "Encuentro de preparación" }).getByText(opponent, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("list", { name: "Partidos recientes del rival" }).getByRole("link")).toHaveCount(5);
  await expect(page.getByRole("list", { name: "Partidos anteriores del rival" }).getByRole("link")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(options.first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("list", { name: "Partidos recientes del rival" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/matches\/[^/?]+$/);
  await expect(page.getByRole("link", { name: "Volver a partidos" })).toBeVisible();
});

test("Sus partidos preserves season and opens all rounds for the selected rival", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: "Sus partidos" });
  await expect(link).toBeVisible();
  const context = new URL((await link.getAttribute("href"))!, page.url());
  await link.click();
  await expect(page.getByRole("combobox", { name: "Temporada", exact: true })).toHaveValue(context.searchParams.get("season")!);
  await expect(page.getByRole("combobox", { name: "Equipo", exact: true })).toHaveValue(context.searchParams.get("team")!);
  await expect(page.getByRole("combobox", { name: "Jornada", exact: true })).toHaveValue("all");
});
