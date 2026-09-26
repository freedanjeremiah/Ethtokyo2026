import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integration tests send real txs (demo kill switches) to the anvil fork.
    testTimeout: 180_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
