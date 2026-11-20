import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Benchmark tests run the matcher over every fixture page; give them room.
    testTimeout: 120_000,
  },
});
