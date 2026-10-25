// Real HTTP/browser checks only. No mocked routes, synthetic fixtures or source access.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const [base, directory] = process.argv.slice(2);
if (!base || !directory) throw new Error("Usage: node scripts/verify-production.mjs http://127.0.0.1:PORT OUTPUT_DIRECTORY");
const origin = new URL(base).origin;
const output = resolve(directory);
await mkdir(output, { recursive: true });
async function read(path) {
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 200, path);
  return response.json();
}

assert.equal((await read("/api/v1/source")).synthetic, false);
const playerId = "sofascore-player-966303";
const profile = await read(`/api/v1/players/${playerId}/profile`);
const matches = await read(`/api/v1/players/${playerId}/observed-matches`);
assert.equal(profile.source.synthetic, false);
const derived = matches.matches.find((row) => row.stats.shotsOnTarget.derivation?.source === "derived");
assert.ok(derived, "The real snapshot must contain a derived shots-on-target value for Moha Keita");
const squad = await read("/api/v1/teams/team-real-jaen/observed-squad");
const feet = squad.competitions.flatMap((competition) => competition.players).filter((row) => row.preferredFoot);
assert.ok(feet.length, "The real snapshot must contain observed preferred feet");
const footPlayer = feet[0];
const footProfile = await read(`/api/v1/players/${footPlayer.player.id}/profile`);
assert.equal(footProfile.player.preferredFoot, footPlayer.preferredFoot);
const replacement = await read("/api/v1/matches/sofascore-match-16599919/observed");
assert.equal(replacement.localReplacement.replacedBy.matchId, "sofascore-match-16969545");

const browser = await chromium.launch();
const results = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    const errors = [];
    const foreignRequests = [];
    const developmentRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().startsWith("http") && new URL(request.url()).origin !== origin) foreignRequests.push(request.url());
      if (/webpack-hmr|turbopack-hmr/.test(request.url())) developmentRequests.push(request.url());
    });
    const screens = [
      ["inicio", "/", () => page.getByRole("region", { name: "Encuentro de preparación", exact: true })],
      ["equipos", "/teams", () => page.getByRole("heading", { level: 2, name: /Real Jaén/ }).first()],
      ["jugadores", "/teams?tab=players", () => page.getByRole("table", { name: /Jugadores observados/ })],
      ["jugador-derivado", `/players/${playerId}?match=${derived.match.id}`, () => page.getByText("Deducido:", { exact: false }).first()],
      ["pierna", `/players/${footPlayer.player.id}`, () => page.getByText("Pierna dominante", { exact: true })],
      ["sustitucion", "/matches/sofascore-match-16599919?view=observed", () => page.getByText(/Este evento está sustituido/)],
    ];
    for (const [name, path, ready] of screens) {
      await page.goto(new URL(path, origin).href);
      await expect(ready()).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(/Demostración · datos sintéticos/)).toHaveCount(0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: page overflow at ${width}`);
      if (name === "pierna") {
        await expect(page.getByText({ left: "Izquierda", right: "Derecha", both: "Ambas" }[footPlayer.preferredFoot], { exact: true })).toBeVisible();
      }
      await page.screenshot({ path: resolve(output, `${width}-${name}.png`), fullPage: true });
      if (name === "equipos" && width === 390) {
        await page.getByRole("button", { name: "Cambiar equipo" }).click();
        await expect(page.getByRole("group", { name: "Equipo", exact: true })).toBeVisible();
        await page.screenshot({ path: resolve(output, `${width}-selector-abierto.png`), fullPage: true });
      }
      results.push({ width, screen: name, overflow: false });
    }
    assert.deepEqual(errors, [], `Browser errors at ${width}`);
    assert.deepEqual(foreignRequests, [], "The browser must only contact its own frontend");
    assert.deepEqual(developmentRequests, [], "The server must not use HMR");
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(resolve(output, "report.json"), JSON.stringify({ origin, profile: playerId, derivedMatch: derived.match.id, footPlayer: footPlayer.player.id, results }, null, 2));
console.log(JSON.stringify({ ok: true, screenshots: output, screens: results.length }));
