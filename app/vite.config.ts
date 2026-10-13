import { defineConfig } from "vitest/config";

// Configuration recommended by Tauri: fixed port and no clearing the console.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    // WebView2 (Windows) is Chromium and WebKitGTK/WKWebView (Linux/macOS) is WebKit.
    target: ["es2021", "chrome105", "safari15"],
  },
  test: {
    // Only the unit tests: the end-to-end ones (e2e/) run in a real browser with Playwright.
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["src/test-setup.ts"],
  },
});
