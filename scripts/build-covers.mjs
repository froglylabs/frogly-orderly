#!/usr/bin/env node
/**
 * Builds the two Marketplace cover images from SVG sources with sharp.
 *
 * Orderly's marketplace submit accepts PNG/JPEG/WebP at exactly 1280x800 or
 * 640x400. These covers are 1280x800. assets/brand/ is empty, so both covers
 * are text-only (no frog logo).
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "assets/covers/src");
const outDir = join(root, "assets/covers");
const brandLogo = join(root, "assets/brand/frog.png");

mkdirSync(srcDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const WIDTH = 1280;
const HEIGHT = 800;

const hasLogo = existsSync(brandLogo);
if (!hasLogo) {
  console.log("covers: assets/brand/frog.png missing; building text-only covers");
}

const cover1 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1f14"/>
      <stop offset="55%" stop-color="#12301d"/>
      <stop offset="100%" stop-color="#0a1710"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="1080" cy="160" r="220" fill="#1b4d2e" opacity="0.35"/>
  <circle cx="180" cy="640" r="260" fill="#1b4d2e" opacity="0.25"/>
  <text x="96" y="330" fill="#e8f5ec" font-family="Georgia, 'Times New Roman', serif" font-size="84" font-weight="700">Frogly for Orderly</text>
  <text x="96" y="430" fill="#9fcdb0" font-family="Georgia, 'Times New Roman', serif" font-size="42">Decoys your traders never see</text>
</svg>
`;

const cover2 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#0a1710"/>
      <stop offset="100%" stop-color="#163825"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <text x="96" y="280" fill="#e8f5ec" font-family="Georgia, 'Times New Roman', serif" font-size="52" font-weight="700">Turn it on in DEX Creator</text>
  <text x="96" y="390" fill="#c5e6d1" font-family="Georgia, 'Times New Roman', serif" font-size="42">Free: 10 catches a month, no sign-up</text>
  <text x="96" y="500" fill="#9fcdb0" font-family="Georgia, 'Times New Roman', serif" font-size="42">See every catch at frogly.ai/orderly</text>
</svg>
`;

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
