// Builds the favicon set from the "34" outlines in the logo plate (D6: silver "34" on Graphite, no gold).
//   node tools/brand/make-favicon.mjs
// Writes to src/assets/brand/: favicon.svg, favicon-32.png, apple-touch-icon.png.
// The glyph path is read from 34-automation-plate.svg (its first <path>, the gold "34"); the gradient
// and stroke are dropped so only flat Silver is used. Needs a Chromium (see tools/check/smoke.mjs).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const brand = resolve(here, '..', '..', 'src', 'assets', 'brand');
const { chromium } = createRequire(join(here, '..', 'package.json'))('playwright-core');

const GRAPHITE = '#0C0E11';
const SILVER = '#CBD3DE';

const plate = readFileSync(join(brand, '34-automation-plate.svg'), 'utf8');
const d = /<path\b[^>]*?\bd="([^"]+)"/.exec(plate)?.[1];
if (!d) throw new Error('No path found in the plate SVG');

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try { if (existsSync(chromium.executablePath())) return undefined; } catch { /* fall through */ }
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse() : [];
  for (const x of dirs) for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
    const p = join(cache, x, arch, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (existsSync(p)) return p;
  }
  return undefined;
}

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();

// Measure the glyph so it can be centred and scaled to a fixed share of the tile.
await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><path id="g" d="${d}"/></svg>`);
const box = await page.evaluate(() => { const b = document.getElementById('g').getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });

const tile = (rx) => {
  const s = 40 / box.w; // "34" fills 62.5% of the tile width
  const tx = 32 - (box.x + box.w / 2) * s;
  const ty = 32 - (box.y + box.h / 2) * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">\n` +
    `<title>34 Automation</title>\n` +
    `<rect width="64" height="64" rx="${rx}" fill="${GRAPHITE}"/>\n` +
    `<path transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${s.toFixed(5)})" fill="${SILVER}" d="${d}"/>\n` +
    `</svg>\n`;
};

writeFileSync(join(brand, 'favicon.svg'), tile(12));

async function png(svg, size, file, transparent) {
  const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(`<body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body>`);
  await p.locator('img').evaluate((i) => i.decode());
  writeFileSync(join(brand, file), await p.screenshot({ omitBackground: transparent }));
  await p.close();
}
await png(tile(12), 32, 'favicon-32.png', true);
await png(tile(0), 180, 'apple-touch-icon.png', false); // iOS rounds the corners itself

await browser.close();
console.log('wrote favicon.svg, favicon-32.png, apple-touch-icon.png to', brand);
