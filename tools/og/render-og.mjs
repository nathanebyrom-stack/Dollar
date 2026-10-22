// Renders the Open Graph image (1200 x 630) from the real brand assets (ARCHITECTURE section 10). Dev-only.
//   cd tools && node og/render-og.mjs
// Graphite with the page's own radial falloff (colours read from tokens.css, so it matches the site), the approved logo
// plate on the left and the "34" die still on the right. No text of its own: no tagline, no claims.
// Writes src/assets/img/og/og-1200x630.jpg. Re-run it when the die stills or the logo change.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const sharp = createRequire(join(here, '..', 'package.json'))('sharp');

const tokens = readFileSync(join(root, 'src', 'assets', 'css', 'tokens.css'), 'utf8');
const colour = (name) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)[1];
const inner = colour('graphite-800'); // Panel
const outer = colour('graphite-900'); // Graphite

const W = 1200, H = 630;
// The same ellipse as --bg-falloff, centred where the die sits (right of centre).
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="${W * 0.7}" cy="${H * 0.5}" r="1" gradientTransform="translate(${W * 0.7} ${H * 0.5}) scale(${W * 0.7} ${H * 0.62}) translate(${-W * 0.7} ${-H * 0.5})">
    <stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/></radialGradient></defs>
  <rect width="${W}" height="${H}" fill="${outer}"/><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`);

// Logo plate, rendered crisply at its final size.
const plate = readFileSync(join(root, 'src', 'assets', 'brand', '34-automation-plate.svg'));
const plateWidth = 500;
const plateImg = await sharp(plate, { density: 300 }).resize({ width: plateWidth }).png().toBuffer();
const plateH = (await sharp(plateImg).metadata()).height;

// Die still: it has a wide transparent margin, so trim to the die itself, then size it by height.
const trimmed = await sharp(join(root, 'src', 'assets', 'img', 'die', 'die-34-1600.avif')).trim().toBuffer();
const die = await sharp(trimmed).resize({ height: 430 }).png().toBuffer();
const dieMeta = await sharp(die).metadata();

const out = join(root, 'src', 'assets', 'img', 'og', 'og-1200x630.jpg');
await sharp(background).composite([
  { input: plateImg, left: 80, top: Math.round((H - plateH) / 2) },
  { input: die, left: Math.round(W * 0.72 - dieMeta.width / 2), top: Math.round((H - dieMeta.height) / 2) },
]).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
console.log(`wrote ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
