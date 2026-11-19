#!/usr/bin/env node
/**
 * Builds the two Marketplace cover images from SVG sources with sharp.
 *
 * Orderly's marketplace submit accepts PNG/JPEG/WebP at exactly 1280x800 or
 * 640x400. These covers are 1280x800: a flat cream background, the frog from
 * assets/brand/frogly-app-icon.svg on cover 1, the word Frogly and one short line.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "assets/covers/src");
const outDir = join(root, "assets/covers");

const WIDTH = 1280;
const HEIGHT = 800;
const BACKGROUND = "#F8EEDA";
const INK = "#141714";
const GREEN = "#0f5021";
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** The frog's shapes from the brand SVG, without the icon's own background square. */
const brand = readFileSync(join(root, "assets/brand/frogly-app-icon.svg"), "utf8");
const frog = brand.match(/<g[\s\S]*<\/g>/)?.[0];
if (!frog) throw new Error("covers: no <g> group in assets/brand/frogly-app-icon.svg");
const frogViewBox = brand.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 400 400";

const cover1 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>
  <svg x="110" y="170" width="460" height="460" viewBox="${frogViewBox}">
    ${frog}
  </svg>
  <text x="630" y="400" fill="${INK}" font-family="${FONT}" font-size="150" font-weight="700">Frogly</text>
  <text x="634" y="475" fill="${GREEN}" font-family="${FONT}" font-size="40">Decoys your traders never see</text>
</svg>
`;

const cover2 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>
  <text x="${WIDTH / 2}" y="390" fill="${INK}" font-family="${FONT}" font-size="150" font-weight="700" text-anchor="middle">Frogly</text>
  <text x="${WIDTH / 2}" y="470" fill="${GREEN}" font-family="${FONT}" font-size="44" text-anchor="middle">Turn it on in DEX Creator</text>
</svg>
`;

mkdirSync(srcDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(srcDir, "cover-1.svg"), cover1);
writeFileSync(join(srcDir, "cover-2.svg"), cover2);

for (const [name, svg] of [
  ["cover-1.png", cover1],
  ["cover-2.png", cover2],
]) {
  const out = join(outDir, name);
  await sharp(Buffer.from(svg)).png().toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`covers: wrote ${name} (${meta.width}x${meta.height})`);
  if (meta.width !== WIDTH || meta.height !== HEIGHT) {
    console.error(`covers: unexpected size for ${name}`);
    process.exit(1);
  }
}

console.log("covers: done");
