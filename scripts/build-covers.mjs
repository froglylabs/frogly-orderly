#!/usr/bin/env node
/**
 * Builds the two Marketplace cover images from SVG sources with sharp.
 *
 * Orderly's marketplace submit accepts PNG/JPEG/WebP at exactly 1280x800 or
 * 640x400. These covers are 1280x800: a flat cream background, the frog from
 * assets/brand/frogly-app-icon.svg, the word Frogly and one short line.
 *
 * Vertical positions come from the rendered pixels, not from font metrics, so
 * each group is centred exactly whatever font the renderer picks. The script
 * fails unless every cover has equal space above and below its content and a
 * flat background colour on all four edges.
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
const BACKGROUND_RGB = [0xf8, 0xee, 0xda];
const INK = "#141714";
const GREEN = "#0f5021";
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** The frog's shapes from the brand SVG, without the icon's own background square. */
const brand = readFileSync(join(root, "assets/brand/frogly-app-icon.svg"), "utf8");
const frog = brand.match(/<g[\s\S]*<\/g>/)?.[0];
if (!frog) throw new Error("covers: no <g> group in assets/brand/frogly-app-icon.svg");
const frogViewBox = brand.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 400 400";

const COVER1_FROG = 460;
const COVER2_FROG = Math.round(COVER1_FROG * 0.4);

const frogAt = (x, y, size) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${frogViewBox}">
    ${frog}
  </svg>`;

const svgDoc = (body, background = true) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
${background ? `  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>\n` : ""}  ${body}
</svg>
`;

/** The painted area [left, right) x [top, bottom), on a transparent canvas. */
async function inkBox(body) {
  const { data, info } = await sharp(Buffer.from(svgDoc(body, false)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let top = -1;
  let bottom = -1;
  let left = info.width;
  let right = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 0) {
        if (top < 0) top = y;
        bottom = y + 1;
        if (x < left) left = x;
        if (x + 1 > right) right = x + 1;
      }
    }
  }
  if (top < 0) throw new Error("covers: nothing painted");
  return { top, bottom, left, right };
}

/** The shifts that put a painted box in the middle of the canvas. */
const centreShift = ({ top, bottom }) => Math.round((HEIGHT - top - bottom) / 2);
const centreShiftX = ({ left, right }) => Math.round((WIDTH - left - right) / 2);

// Cover 1: the frog and the text block are each centred on the canvas middle,
// and the pair is centred across the canvas.
const cover1Text = (dx, dy) => `<text x="${630 + dx}" y="${400 + dy}" fill="${INK}" font-family="${FONT}" font-size="150" font-weight="700">Frogly</text>
  <text x="${634 + dx}" y="${475 + dy}" fill="${GREEN}" font-family="${FONT}" font-size="36">Keep your DEX safe from AI attacks</text>`;
const cover1FrogY = centreShift(await inkBox(frogAt(110, 0, COVER1_FROG)));
const cover1TextDy = centreShift(await inkBox(cover1Text(0, 0)));
const cover1Body = (dx) => `${frogAt(110 + dx, cover1FrogY, COVER1_FROG)}
  ${cover1Text(dx, cover1TextDy)}`;
const cover1 = svgDoc(cover1Body(centreShiftX(await inkBox(cover1Body(0)))));

// Cover 2: the frog above "Frogly", the whole stack centred on the canvas middle.
const cover2Body = (dy) => `${frogAt((WIDTH - COVER2_FROG) / 2, 150 + dy, COVER2_FROG)}
  <text x="${WIDTH / 2}" y="${450 + dy}" fill="${INK}" font-family="${FONT}" font-size="150" font-weight="700" text-anchor="middle">Frogly</text>
  <text x="${WIDTH / 2}" y="${530 + dy}" fill="${GREEN}" font-family="${FONT}" font-size="44" text-anchor="middle">Turn it on in DEX Creator</text>`;
const cover2 = svgDoc(cover2Body(centreShift(await inkBox(cover2Body(0)))));

/** Fails unless the edges are flat background and the content has equal margins. */
async function checkCover(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const isBackground = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return BACKGROUND_RGB.every((c, k) => data[i + k] === c);
  };
  for (let x = 0; x < info.width; x++) {
    if (!isBackground(x, 0) || !isBackground(x, info.height - 1)) throw new Error(`covers: ${file} top or bottom edge is not ${BACKGROUND}`);
  }
  for (let y = 0; y < info.height; y++) {
    if (!isBackground(0, y) || !isBackground(info.width - 1, y)) throw new Error(`covers: ${file} left or right edge is not ${BACKGROUND}`);
  }
  let top = -1;
  let bottom = -1;
  let left = info.width;
  let right = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (!isBackground(x, y)) {
        if (top < 0) top = y;
        bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  const above = top;
  const below = info.height - 1 - bottom;
  const leftMargin = left;
  const rightMargin = info.width - 1 - right;
  if (Math.abs(above - below) > 1) throw new Error(`covers: ${file} margins differ (${above}px above, ${below}px below)`);
  return { above, below, leftMargin, rightMargin };
}

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
  if (meta.width !== WIDTH || meta.height !== HEIGHT) {
    console.error(`covers: unexpected size for ${name}`);
    process.exit(1);
  }
  const { above, below, leftMargin, rightMargin } = await checkCover(out);
  console.log(
    `covers: wrote ${name} (${meta.width}x${meta.height}; margins ${above}px above, ${below}px below, ${leftMargin}px left, ${rightMargin}px right; edges flat ${BACKGROUND})`,
  );
}

console.log("covers: done");
