import { defineConfig, devices } from "@playwright/test";

const host = process.env.FROGLY_E2E_HOST || "http://127.0.0.1:4173";

export default defineConfig({
  testDir: ".",
  testMatch: "frogly.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["json", { outputFile: ".output/results.json" }]],
  use: {
    baseURL: host,
    // Use the machine's Google Chrome binary. Playwright's bundled Chromium is
    // not available on every macOS/arm64 combination contributors run.
    // Always headless, and always a fresh temporary profile: Playwright's
    // launch() creates a throwaway user data directory per browser and deletes
    // it afterwards. Never use launchPersistentContext or a --user-data-dir
    // argument here; that would reuse a real Chrome profile.
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: ".output/artifacts",
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        channel: "chrome",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
