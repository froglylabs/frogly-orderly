import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { version } from "./package.json";

export default defineConfig({
  define: { __FROGLY_VERSION__: JSON.stringify(version) },
  // The host app provides @orderly.network/hooks at run time; it is not
  // installed here, so tests resolve it to a small stand-in.
  resolve: {
    alias: {
      "@orderly.network/hooks": fileURLToPath(new URL("./test/stubs/orderly-hooks.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // The dist test builds the package first.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
