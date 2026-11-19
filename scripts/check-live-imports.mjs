#!/usr/bin/env node
/**
 * Checks dist/index.mjs against a live DEX Creator site, without a browser.
 *
 * For every import in the built plugin, the live import map must provide the
 * specifier, and the live chunk it points at must export each imported name.
 * Run `pnpm build` first.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LIVE_PAGE, fetchLiveImportMap, liveExports } from "./live-host.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Reads `import ... from "x"` statements: specifier plus the names it needs. */
function pluginImports(source) {
  const imports = [];
  for (const match of source.matchAll(/^\s*import\s+([^;]*?)\s+from\s+"([^"]+)"/gm)) {
    const [, clause, specifier] = match;
    const names = [];
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) names.push(name);
      }
    }
    const head = clause.replace(/\{[^}]*\}/, "").replace(/,/g, " ").trim();
    if (head.startsWith("* as ")) names.push("*");
    else if (head) names.push("default");
    imports.push({ specifier, names });
  }
  if (/\bimport\s*\(/.test(source)) throw new Error("dist/index.mjs contains a dynamic import()");
  return imports;
}

const imports = pluginImports(readFileSync(join(root, "dist/index.mjs"), "utf8"));
const map = await fetchLiveImportMap();

const problems = [];
for (const { specifier, names } of imports) {
  if (!map[specifier]) {
    problems.push(`${specifier}: not in the live import map`);
    continue;
  }
  const { url, names: exported } = await liveExports(specifier, map);
  for (const name of names) {
    if (name === "*") continue;
    if (exported.includes(name)) {
      console.log(`ok  ${name} from ${specifier}`);
    } else {
      problems.push(`${specifier}: live chunk ${url} does not export ${name}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`check:live failed against ${LIVE_PAGE}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`check:live: ok (${imports.length} imports, live map on ${LIVE_PAGE})`);
