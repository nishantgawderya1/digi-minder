import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/pwa",
  outputDir: "./test-results/pwa",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4180",
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/pwa/server.mjs",
    url: "http://127.0.0.1:4180",
    reuseExistingServer: false,
    env: {
      HOST: "127.0.0.1",
      PORT: "4180",
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: "4180",
    },
  },
});
