import { defineConfig } from "vitest/config";
import { version } from "./package.json";

export default defineConfig({
  define: { __FROGLY_VERSION__: JSON.stringify(version) },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // The dist test builds the package first.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
