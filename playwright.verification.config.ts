import { defineConfig } from "@playwright/test";
if (!process.env.NEMODOC_VERIFY_DATA_DIR)
  throw new Error("Run npm run verify:agents to create isolated storage.");
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "agent-overview.spec.ts",
    "agent-configuration.spec.ts",
    "home.spec.ts",
    "library.spec.ts",
  ],
  timeout: 45000,
  workers: 1,
  outputDir: "output/verification/results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "output/verification/report", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4179",
    viewport: { width: 1440, height: 1000 },
    trace: "on",
    video: "on",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: "npx tsx server/index.ts",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      HOST: "127.0.0.1",
      PORT: "4179",
      DOTENV_CONFIG_PATH: "/dev/null",
      NEMODOC_DATA_DIR: process.env.NEMODOC_VERIFY_DATA_DIR,
      NEBIUS_API_KEY: "",
      NVIDIA_API_KEY: "",
      DATABASE_URL: "",
      AGENT_READ_DATABASE_URL: "",
    },
  },
});
