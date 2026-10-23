import { expect, test } from "@playwright/test";

test("opens on Inicio and moves to Equipos with the synthetic-data notice", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Preparación de rival" })).toBeVisible();
  await expect(page.getByText("Demostración · datos sintéticos", { exact: true })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Secciones" });
  await expect(nav.getByRole("link")).toHaveText(["Inicio", "Partidos", "Equipos"]);
  await nav.getByRole("link", { name: "Equipos" }).click();
  await expect(page).toHaveURL(/\/teams$/);
  await expect(page.getByRole("heading", { level: 1, name: "Equipos" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Equipos" })).toHaveAttribute("aria-current", "page");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
