import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Test-only access files of the e2e server (never a real installation's secrets). */
export const ACCESS_FIXTURES = resolve(__dirname, "fixtures", "access");
export const E2E_PASSWORD = readFileSync(join(ACCESS_FIXTURES, "access-password"), "utf8").trim();
/** The signed-in browser state shared by the specs, outside the repository. */
export const STORAGE_STATE = join(tmpdir(), "rj-analyst-e2e", "session.json");
