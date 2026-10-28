import { expect, test, type Page } from "@playwright/test";
import { REAL_SOURCE } from "./sources";

/*
 * Update control (docs/contrato-actualizaciones.md) with simulated /api/v1/updates answers: the e2e server is
 * the demonstration, where updates do not exist. The full flow with the real backend and the local provider is
 * validated separately (api-real-jaen docker/acquisition/test_updates.py).
 */

const SCOPE = { kind: "pilot", label: "Actualización piloto: calendario de la jornada 1 y un partido", round: 1,
  matchIds: ["sofascore-match-16599363"] };
const job = (over: Record<string, unknown> = {}) => ({
  id: "7f1c2a3b-4d5e-4f60-8a1b-2c3d4e5f6a7b", status: "running", phase: "acquiring", cancellable: true, cancelRequested: false,
  published: false, requestedAt: "2026-10-28T17:00:00Z", finishedAt: null, pollAfterSeconds: 1, error: null, result: null, ...over,
});
const completed = job({ status: "completed", phase: "finished", cancellable: false, published: true,
  finishedAt: "2026-10-28T17:02:00Z", result: { publishedAt: "2026-10-28T17:02:00Z", reusedBundle: false } });

async function serveUpdates(page: Page, { operator = true } = {}) {
  const state = { started: 0, polls: 0, operator };
  await page.route("**/api/v1/source", (route) => route.fulfill({ json: REAL_SOURCE }));
  await page.route("**/api/v1/updates/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/updates/session" && request.method() === "POST") {
      state.operator = true;
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/v1/updates/current") {
      const finished = state.polls >= 2;
      return route.fulfill({ json: { available: true, operator: state.operator, scope: SCOPE,
        lastPublished: finished ? { at: "2026-10-28T17:02:00Z" } : null,
        ...(state.operator ? { activeJob: state.started && !finished ? job() : null, lastJob: finished ? completed : null } : {}) } });
    }
    state.polls += 1;
    return route.fulfill({ json: state.polls >= 2 ? completed : job({ phase: "publishing", cancellable: false }) });
  });
  await page.route("**/api/v1/updates", (route) => {
    state.started += 1;
    return route.fulfill({ status: 202, json: { job: job(), reused: state.started > 1 } });
  });
  return state;
}

test("an operator signs in, sees the real scope and follows one update to its publication", async ({ page }) => {
  const state = await serveUpdates(page, { operator: false });
  await page.goto("/operador");
  await expect(page.getByRole("heading", { name: "Actualización de datos" })).toBeVisible();
  await expect(page.getByText("No actualiza el resto de la jornada ni de la temporada", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /Actualizar/ })).toHaveCount(0);
  await page.getByLabel("Clave de operador").fill("operator-key");
  await page.getByRole("button", { name: "Entrar" }).click();
  const start = page.getByRole("main").getByRole("button", { name: "Actualizar piloto" });
  await expect(start).toBeVisible();
  // The top bar follows the new session at once, without navigating.
  await expect(page.getByRole("banner").getByRole("button", { name: /Actualizar: Actualización piloto/ })).toBeVisible();
  await start.dblclick();
  // The top bar follows the job started from this screen.
  await expect(page.getByRole("banner").getByRole("button", { name: /^Cancelar|Recargar datos/ })).toBeVisible();
  await expect(page.getByRole("main").getByText(/Publicado el 28\/10/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("main").getByRole("button", { name: "Recargar datos" })).toBeVisible();
  expect(state.started).toBe(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("the top bar shows the update control only to an operator, labelled as the pilot", async ({ page }) => {
  await serveUpdates(page, { operator: false });
  await page.goto("/teams");
  await expect(page.getByRole("banner").getByRole("button", { name: /Actualizar/ })).toHaveCount(0);
  await page.unrouteAll();
  await serveUpdates(page, { operator: true });
  await page.goto("/teams");
  const control = page.getByRole("banner").getByRole("button", { name: /Actualizar: Actualización piloto/ });
  await expect(control).toBeVisible();
  await expect(control).toHaveText("Actualizar piloto");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
