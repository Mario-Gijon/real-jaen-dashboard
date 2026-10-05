// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd: root });

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => join(root, dir, file));
}

async function restrictedImports(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === "no-restricted-imports");
}

/** The boundary UI → client → /api/v1 → DataSource is enforced by lint. */
describe("architecture boundary", () => {
  it.each([
    ["src/features/matches/MatchList.tsx", 'import { getDataSource } from "@/server/data-source";'],
    [
      "src/ui/Widget.tsx",
      'import { syntheticSource } from "../server/synthetic/synthetic-source";',
    ],
    ["src/app/matches/page.tsx", 'import season from "../../../data/synthetic/season.json";'],
    ["src/client/api.ts", 'import { getDataSource } from "@/server/data-source";'],
  ])("%s cannot reach server code or data files", async (filePath, code) => {
    expect(await restrictedImports(filePath, code)).toHaveLength(1);
  });

  it("lets API route handlers use the data source", async () => {
    const code =
      'import { getDataSource } from "@/server/data-source";\nexport const source = getDataSource;';
    expect(await restrictedImports("src/app/api/v1/matches/route.ts", code)).toHaveLength(0);
  });

  it("lets only the synthetic adapter know where the synthetic data live", () => {
    const readers = sourceFiles("src")
      .filter((file) => !file.endsWith(".test.ts"))
      .filter((file) =>
        /data[/\\]synthetic|["']data["'],\s*["']synthetic["']/.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(root, file).replaceAll("\\", "/"));
    expect(readers.length).toBeGreaterThan(0);
    for (const file of readers) expect(file.startsWith("src/server/synthetic/"), file).toBe(true);
  });

  it("keeps /api/v1 read-only: route handlers export GET and nothing else", async () => {
    const routes = sourceFiles("src/app/api").filter((file) => file.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThanOrEqual(7);
    for (const file of routes) {
      const exported = Object.keys(await import(/* @vite-ignore */ pathToFileURL(file).href));
      expect(exported, relative(root, file)).toEqual(["GET"]);
    }
  });

  it("keeps the server independent from screens and the browser client", async () => {
    expect(
      await restrictedImports("src/server/synthetic/x.ts", 'import { api } from "@/client/api";'),
    ).toHaveLength(1);
    expect(
      await restrictedImports(
        "src/server/synthetic/y.ts",
        'import { AppShell } from "@/ui/AppShell";',
      ),
    ).toHaveLength(1);
  });
});
