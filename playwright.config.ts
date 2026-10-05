import { defineConfig, devices } from "@playwright/test";

/** Desktop (1440 px) and phone (390 px) checks against the production build. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: "npm run build && npx next start -p 3100",
    url: "http://127.0.0.1:3100/api/v1/source",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
