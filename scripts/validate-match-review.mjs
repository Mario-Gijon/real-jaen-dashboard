/**
 * Browser half of the review check of a corrected match (driven by api-real-jaen/docker/acquisition/test_group.py):
 * a real Next production server over the backend's isolated copy, after a score correction whose sections could
 * not be re-read ("pending") and after they were recovered ("recovered").
 *
 *   node scripts/validate-match-review.mjs <phase> <baseUrl> <matchId> <outDir>
 *
 * Opens the match detail, checks the review notice is there (pending) or gone (recovered), screenshots «Resumen»
 * and «Alineaciones» at 1440 and 390 px into outDir and prints one JSON report line.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [phase, baseUrl, matchId, outDir] = process.argv.slice(2);
const NOTICE = "El marcador se ha actualizado, pero algunas secciones siguen pendientes de revisión.";
const report = { phase, matchId, screenshots: [] };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function shot(name) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const file = join(outDir, `revision-${phase}-${name}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    report.screenshots.push({ file, width, overflow });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

try {
  await page.goto(`${baseUrl}/matches/sofascore-match-${matchId}`);
  const main = page.getByRole("main");
  await main.getByRole("heading", { level: 1 }).waitFor({ timeout: 60_000 });
  await main.getByRole("tab", { name: "Resumen" }).waitFor();
  await page.waitForLoadState("networkidle");
  const note = main.getByRole("note", { name: "Secciones pendientes de revisión" });
  report.score = (await main.locator("strong").first().innerText()).trim();
  report.notice = (await note.count()) ? (await note.innerText()).trim() : null;
  await shot("resumen");
  await main.getByRole("tab", { name: "Alineaciones" }).click();
  await main.getByRole("tabpanel", { name: "Alineaciones" }).waitFor();
  await page.waitForLoadState("networkidle");
  report.goalsWithheld = (await main.getByText(/Las incidencias son anteriores a la corrección del marcador/).count()) > 0;
  await shot("alineaciones");
  report.ok = phase === "pending"
    ? report.notice !== null && report.notice.includes(NOTICE) && report.goalsWithheld
    : report.notice === null && !report.goalsWithheld;
  report.ok &&= report.screenshots.every((s) => !s.overflow);
} catch (error) {
  report.ok = false;
  report.error = String(error);
  await page.screenshot({ path: join(outDir, `revision-${phase}-error.png`), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  writeFileSync(join(outDir, `revision-${phase}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
