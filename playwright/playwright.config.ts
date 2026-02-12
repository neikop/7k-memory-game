import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  timeout: 15 * 60 * 1000,
  outputDir: "./output",
  use: {
    headless: true,
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
  reporter: [["line"]],
})
