import { defineConfig, devices } from "@playwright/test";

// End-to-end tests: the interface in Chromium, against the Vite dev server.
// In a plain browser the app uses the in-memory preview of the core (see
// browserPreviewStorage in src/storage.ts), so every flow runs without Tauri.
// The preview keeps nothing across a reload: each test starts with no users.

// Only `process.env` is needed here. It is declared locally so the interface's
// typecheck doesn't take in Node's globals (they would change setTimeout's type).
declare const process: { env: Record<string, string | undefined> };

const PORT = 1433;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      // The window size the app is designed around: the toolbar and panels fit without wrapping.
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 900 } },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});
