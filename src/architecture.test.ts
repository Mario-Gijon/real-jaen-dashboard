// @vitest-environment node
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd: root });

async function restrictedImports(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === "no-restricted-imports");
}

/** The boundary UI → client → /api/v1 → DataSource is enforced by lint. */
describe("architecture boundary", () => {
  it.each([
    ["src/features/matches/MatchList.tsx", 'import { getDataSource } from "@/server/data-source";'],
    ["src/ui/Widget.tsx", 'import { syntheticSource } from "../server/synthetic/synthetic-source";'],
    ["src/app/matches/page.tsx", 'import season from "../../../data/synthetic/season.json";'],
    ["src/client/api.ts", 'import { getDataSource } from "@/server/data-source";'],
  ])("%s cannot reach server code or data files", async (filePath, code) => {
    expect(await restrictedImports(filePath, code)).toHaveLength(1);
  });

  it("lets API route handlers use the data source", async () => {
    const code = 'import { getDataSource } from "@/server/data-source";\nexport const source = getDataSource;';
    expect(await restrictedImports("src/app/api/v1/matches/route.ts", code)).toHaveLength(0);
  });

  it("keeps the server independent from screens and the browser client", async () => {
    expect(
      await restrictedImports("src/server/synthetic/x.ts", 'import { api } from "@/client/api";'),
    ).toHaveLength(1);
    expect(
      await restrictedImports("src/server/synthetic/y.ts", 'import { AppShell } from "@/ui/AppShell";'),
    ).toHaveLength(1);
  });
});
