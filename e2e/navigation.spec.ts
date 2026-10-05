import { expect, test } from "@playwright/test";

test("opens on Partidos and moves to Equipos with the synthetic-data notice", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.getByRole("heading", { level: 1, name: "Partidos" })).toBeVisible();
  await expect(page.getByText("Datos sintéticos")).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Secciones" });
  await expect(nav.getByRole("link")).toHaveText(["Partidos", "Equipos"]);
  await nav.getByRole("link", { name: "Equipos" }).click();
  await expect(page).toHaveURL(/\/teams$/);
  await expect(page.getByRole("heading", { level: 1, name: "Equipos" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Equipos" })).toHaveAttribute("aria-current", "page");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
