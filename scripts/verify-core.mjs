#!/usr/bin/env node
/**
 * Downloads the pinned Frogly core and checks its sha384 against src/core.ts.
 * Exit 0 on match, 1 on any failure.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "src/core.ts"), "utf8");

const srcMatch = source.match(/export const CORE_SRC =\s*"([^"]+)"/);
const integrityMatch = source.match(/export const CORE_INTEGRITY =\s*"([^"]+)"/);
if (!srcMatch || !integrityMatch) {
  console.error("verify:core: could not read CORE_SRC / CORE_INTEGRITY from src/core.ts");
  process.exit(1);
}

const CORE_SRC = srcMatch[1];
const CORE_INTEGRITY = integrityMatch[1];
const expected = CORE_INTEGRITY.replace(/^sha384-/, "");

console.log(`verify:core: fetching ${CORE_SRC}`);
const response = await fetch(CORE_SRC);
if (!response.ok) {
  console.error(`verify:core: download failed (${response.status})`);
  process.exit(1);
}
const bytes = Buffer.from(await response.arrayBuffer());
const actual = createHash("sha384").update(bytes).digest("base64");
const pinned = `sha384-${actual}`;

if (actual !== expected) {
  console.error("verify:core: integrity mismatch");
  console.error(`  pinned:   ${CORE_INTEGRITY}`);
  console.error(`  downloaded: ${pinned}`);
  console.error(`  bytes: ${bytes.length}`);
  process.exit(1);
}

console.log(`verify:core: ok (${bytes.length} bytes, ${pinned})`);
