import { config } from "dotenv";
import { defineConfig } from "vitest/config";

const testEnv = config({ path: ".env.test", quiet: true }).parsed ?? {};

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    env: testEnv,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Every suite shares one Postgres database and truncates between tests,
    // so files must not overlap.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
