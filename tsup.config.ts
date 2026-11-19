import { defineConfig } from "tsup";
import { version } from "./package.json";

/**
 * One readable file per format, no code splitting, not minified.
 *
 * Orderly DEX Creator loads marketplace plugins at run time as one ESM file
 * (dist/index.mjs) and resolves bare imports through an import map in the DEX
 * page, so react, react-dom, react/jsx-runtime and every @orderly.network/*
 * package stay external and are imported by their bare names.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "es2020",
  splitting: false,
  minify: false,
  sourcemap: false,
  // esbuild already drops unused code; the extra rollup pass only reorders
  // the output and makes it harder to read next to the source.
  treeshake: false,
  clean: true,
  dts: true,
  external: ["react", "react-dom", /^react\//, /^@orderly\.network\//],
  // The plugin version is read from package.json at build time.
  define: { __FROGLY_VERSION__: JSON.stringify(version) },
});
