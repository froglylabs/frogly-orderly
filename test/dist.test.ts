// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { CORE_INTEGRITY, CORE_SRC } from "../src/core";

const root = new URL("../", import.meta.url);
const file = (name: string) => new URL(name, root);
const read = (name: string) => readFileSync(file(name), "utf8");

/** Exactly these imports, and nothing else, may appear in the ESM build. */
const ALLOWED_ESM_IMPORTS = [
  'import { createInterceptor } from "@orderly.network/plugin-core";',
  'import { useConfig } from "@orderly.network/hooks";',
  'import { useEffect } from "react";',
  // Array children only: DEX Creator's jsx-runtime import map omits Fragment.
  'import { jsx } from "react/jsx-runtime";',
].sort();

const ALLOWED_SPECIFIERS = ["@orderly.network/hooks", "@orderly.network/plugin-core", "react", "react/jsx-runtime"];

/** Nothing in the build may use these. */
const FORBIDDEN = [
  /\beval\s*\(/,
  /\bnew\s+Function\b/,
  /\bFunction\s*\(/,
  /innerHTML/,
  /outerHTML/,
  /insertAdjacentHTML/,
  /document\.write/,
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /sendBeacon/,
  /WebSocket/,
  /localStorage/,
  /sessionStorage/,
  /indexedDB/,
  /cookie/,
  /import\s*\(/,
];

beforeAll(() => {
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "pipe" });
});

describe("dist/index.mjs", () => {
  it("imports only createInterceptor, useConfig, react and react/jsx-runtime", () => {
    const source = read("dist/index.mjs");
    const imports = source.split("\n").filter((line) => /^\s*import\b/.test(line));
    expect(imports.map((line) => line.trim()).sort()).toEqual(ALLOWED_ESM_IMPORTS);
    // No import hides elsewhere (multi-line, dynamic, or inside a string).
    for (const match of source.matchAll(/\bfrom\s*["']([^"']+)["']/g)) {
      expect(ALLOWED_SPECIFIERS).toContain(match[1]);
    }
  });

  it("is under 8 KB", () => {
    expect(statSync(file("dist/index.mjs")).size).toBeLessThan(8 * 1024);
  });

  it("contains none of eval, new Function, innerHTML, document.write, or any network or storage API", () => {
    const source = read("dist/index.mjs");
    for (const pattern of FORBIDDEN) {
      expect(source, `found ${pattern}`).not.toMatch(pattern);
    }
  });

  it("carries the pinned core address and hash, and the package version", () => {
    const source = read("dist/index.mjs");
    const pkg = JSON.parse(read("package.json")) as { version: string };
    expect(source).toContain(`"${CORE_SRC}"`);
    expect(source).toContain(`"${CORE_INTEGRITY}"`);
    expect(source).toContain(`version: "${pkg.version}"`);
    expect(CORE_SRC).toBe("https://cdn.frogly.ai/w/core.v5.js");
    expect(CORE_INTEGRITY).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
  });

  it("exports registerFroglyPlugin, registerPlugin and default", async () => {
    const mod = (await import(file("dist/index.mjs").href)) as Record<string, unknown>;
    expect(typeof mod.registerFroglyPlugin).toBe("function");
    expect(mod.registerPlugin).toBe(mod.registerFroglyPlugin);
    expect(mod.default).toBe(mod.registerFroglyPlugin);
  });
});

describe("dist/index.js (CommonJS) and types", () => {
  it("requires only the same four packages", () => {
    const source = read("dist/index.js");
    const required = Array.from(source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)).map((m) => m[1]);
    expect(required.sort()).toEqual([...ALLOWED_SPECIFIERS].sort());
    for (const pattern of FORBIDDEN) {
      expect(source, `found ${pattern}`).not.toMatch(pattern);
    }
  });

  it("ships type declarations for the three exports", () => {
    expect(existsSync(file("dist/index.d.ts"))).toBe(true);
    const types = read("dist/index.d.ts");
    expect(types).toMatch(/registerFroglyPlugin/);
    expect(types).toMatch(/registerFroglyPlugin as registerPlugin/);
    expect(types).toMatch(/registerFroglyPlugin as default/);
    expect(types).toMatch(/FroglySettings/);
    expect(types).toMatch(/FroglyCodeOptions/);
  });

  it("is one file per format, with no code-split chunks or source maps", () => {
    const expected = ["index.d.mts", "index.d.ts", "index.js", "index.mjs"];
    expect(readdirSync(file("dist/")).sort()).toEqual(expected);
  });
});
