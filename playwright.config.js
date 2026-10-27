import { defineConfig } from "@playwright/test";

const liveFrontend = process.env.ECHO_LIVE_FRONTEND;

export default defineConfig({
  testDir: "./tests",
  timeout: liveFrontend ? 90_000 : 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: {
    baseURL: liveFrontend || "http://127.0.0.1:5175",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      ...(process.env.ECHO_BROWSER_PATH ? { executablePath: process.env.ECHO_BROWSER_PATH } : {}),
      args: ["--autoplay-policy=user-gesture-required"],
    },
  },
  webServer: liveFrontend ? undefined : [
    { command: "node server/index.js", env: { PORT: "3015", CLIENT_ORIGIN: "http://127.0.0.1:5175" }, url: "http://127.0.0.1:3015/health", reuseExistingServer: false },
    { command: "npm run dev -- --host 127.0.0.1 --port 5175 --strictPort", env: { VITE_API_URL: "http://127.0.0.1:3015" }, url: "http://127.0.0.1:5175", reuseExistingServer: false },
  ],
});
