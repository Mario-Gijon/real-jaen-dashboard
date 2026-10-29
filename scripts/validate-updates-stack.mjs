/**
 * Browser half of the full update validation (driven by api-real-jaen/docker/acquisition/test_updates.py): a real
 * Next production server, the backend in control mode and the acquisition service with its local provider.
 *
 *   node scripts/validate-updates-stack.mjs <phase> <baseUrl> <operatorKeyFile> <outDir> <secretFile>...
 *
 * Phases: "publish" (sign in, cancel one update while it acquires, then publish another with repeated clicks) and
 * "refusal" (the provider refuses: failed, previous data kept). Screenshots at 1440 and 390 px go to outDir; every
 * response the browser receives is checked for the secrets. Prints one JSON report line.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [phase, baseUrl, keyFile, outDir, ...secretFiles] = process.argv.slice(2);
const key = readFileSync(keyFile, "utf8").trim();
const secrets = secretFiles.map((file) => readFileSync(file, "utf8").trim()).concat(key);
const report = { phase, steps: [], screenshots: [], leaks: [], updatePosts: 0, cookies: [] };
const step = (name, detail = {}) => report.steps.push({ name, at: new Date().toISOString(), ...detail });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("request", (request) => {
  if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/updates") report.updatePosts += 1;
});
page.on("response", async (response) => {
  try {
    const text = `${JSON.stringify(response.headers())}${await response.text()}`;
    for (const secret of secrets) if (secret && text.includes(secret)) report.leaks.push(response.url());
  } catch {
    // Redirects and aborted requests have no body.
  }
});

async function shot(name) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const file = join(outDir, `${phase}-${name}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    report.screenshots.push({ file, width, overflow });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

const main = () => page.getByRole("main");
const observed = async () => (await page.request.get(`${baseUrl}/api/v1/matches/sofascore-match-16599363/observed`)).text();

try {
  await page.goto(`${baseUrl}/operador`);
  await main().getByText("No actualiza el resto de la jornada", { exact: false }).waitFor();
  if (phase === "publish") await shot("login");
  await main().getByLabel("Clave de operador").fill(key);
  await main().getByRole("button", { name: "Entrar" }).click();
  await main().getByRole("button", { name: /Actualizar piloto|Cancelar/ }).waitFor();
  report.cookies = (await context.cookies()).map((c) => ({ name: c.name, httpOnly: c.httpOnly, sameSite: c.sameSite, path: c.path }));
  step("signed-in");
  const before = await observed();

  if (phase === "publish") {
    await shot("idle");
    // 1. Cancel while acquiring: nothing is imported.
    await main().getByRole("button", { name: "Actualizar piloto" }).click();
    const cancel = main().getByRole("button", { name: "Cancelar" });
    await cancel.waitFor({ timeout: 15_000 });
    await shot("acquiring");
    await cancel.click();
    await main().getByText("Cancelada. Se mantienen los datos anteriores.").waitFor({ timeout: 90_000 });
    step("cancelled", { unchanged: (await observed()) === before });
    await shot("cancelled");
    // 2. Repeated clicks start one update, followed to its publication.
    const posts = report.updatePosts;
    const start = main().getByRole("button", { name: "Actualizar piloto" });
    await start.click({ clickCount: 3, delay: 20 });
    await main().getByText(/Publicado el/).waitFor({ timeout: 180_000 });
    step("published", { postsForThisStart: report.updatePosts - posts });
    await shot("published");
    await page.goto(`${baseUrl}/teams`);
    await page.getByRole("banner").getByRole("button", { name: /Actualizar piloto: Actualización piloto/ }).waitFor();
    await page.waitForLoadState("networkidle");
    await shot("header");
    await page.goto(`${baseUrl}/matches/sofascore-match-16599363`);
    await page.waitForLoadState("networkidle");
    step("match-page", { status: (await page.request.get(`${baseUrl}/api/v1/matches/sofascore-match-16599363/observed`)).status() });
    await shot("match");
  } else {
    await main().getByRole("button", { name: "Actualizar piloto" }).click();
    // This refusal's own message, not the line of an earlier job that also kept the previous data.
    await main().getByText(/no se completó o fue rechazada/).waitFor({ timeout: 180_000 });
    const line = await main().getByRole("status").innerText();
    step("refused", { line, unchanged: (await observed()) === before });
    await shot("refused");
  }
  await page.goto(`${baseUrl}/operador`);
  await main().getByRole("button", { name: "Cerrar sesión" }).click();
  await main().getByLabel("Clave de operador").waitFor();
  step("signed-out");
  report.ok = report.leaks.length === 0;
} catch (error) {
  report.ok = false;
  report.error = String(error);
  await page.screenshot({ path: join(outDir, `${phase}-error.png`), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  writeFileSync(join(outDir, `${phase}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
