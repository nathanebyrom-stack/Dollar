// Renders the pre-rendered die stills from the real 3D scene (ARCHITECTURE section 8). Dev-only.
//   cd tools && npm install && node stills/render-stills.mjs
// Builds the site, serves it under the CSP from netlify.toml, and for each face loads /?still=<name> at 1600x1600,
// which draws that face square-on on a transparent canvas (stage.js, "still" mode). The canvas is read back as a PNG
// and encoded to AVIF and WebP, with alpha, at 1600 and 800 px wide, into src/assets/img/die/.
//
// Why WebP rather than the JPG ARCHITECTURE names: the stills sit over the page's radial falloff, so they must be
// transparent, and JPG has no alpha. AVIF (first choice) and WebP (fallback) both do.
// Software WebGL (SwiftShader) is used on purpose: slower, but the same output on every machine.
// Re-run whenever the die's geometry, materials, lighting or engravings change, then commit the images.
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const dist = join(root, 'dist');
const outDir = join(root, 'src', 'assets', 'img', 'die');
const require = createRequire(join(here, '..', 'package.json'));
const { chromium } = require('playwright-core');
const sharp = require('sharp');

const FACES = ['34', 'web-design', 'marketing', 'workflow-automation'];
const SIZES = [1600, 800];
const AVIF = { quality: 50, effort: 6 };
const WEBP = { quality: 80, alphaQuality: 90, effort: 6 };
const MOBILE_AVIF_BUDGET = 60 * 1024; // ARCHITECTURE section 12: hero die still on mobile <= 60 KB AVIF

execFileSync('node', [join(root, 'scripts', 'build.mjs')], { stdio: 'ignore' });

const csp = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(readFileSync(join(root, 'netlify.toml'), 'utf8'))[1].replace('; upgrade-insecure-requests', '');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let p = join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream', 'Content-Security-Policy': csp });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

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

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let over = 0;

for (const face of FACES) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1600 }, deviceScaleFactor: 1 });
  const errors = [];
  const missing = []; // 404s: the page's own <img> points at the stills, which do not exist on the very first run
  page.on('response', (r) => { if (r.status() === 404) missing.push(new URL(r.url()).pathname); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/?still=${face}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stillReady === true, null, { timeout: 60000 });
  const dataUrl = await page.evaluate(() => window.__still());
  await page.close();
  const expected404 = missing.length > 0 && missing.every((p) => p.startsWith('/assets/img/die/'));
  const real = errors.filter((e) => !(expected404 && /^Failed to load resource/.test(e)));
  if (real.length || missing.some((p) => !p.startsWith('/assets/img/die/'))) throw new Error(`${face}: ${[...real, ...missing.filter((p) => !p.startsWith('/assets/img/die/')).map((p) => `404 ${p}`)].join(' | ')}`);

  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  const meta = await sharp(png).metadata();
  if (meta.width !== 1600 || meta.height !== 1600 || !meta.hasAlpha) throw new Error(`${face}: expected a 1600x1600 PNG with alpha, got ${meta.width}x${meta.height} alpha=${meta.hasAlpha}`);

  const line = [];
  for (const size of SIZES) {
    const img = sharp(png).resize(size, size, { kernel: 'lanczos3' });
    const avif = await img.clone().avif(AVIF).toBuffer();
    const webp = await img.clone().webp(WEBP).toBuffer();
    writeFileSync(join(outDir, `die-${face}-${size}.avif`), avif);
    writeFileSync(join(outDir, `die-${face}-${size}.webp`), webp);
    line.push(`${size}: avif ${kb(avif.length)}, webp ${kb(webp.length)}`);
    if (size === 800 && avif.length > MOBILE_AVIF_BUDGET) { over++; line.push('(OVER the 60 KB mobile AVIF budget)'); }
  }
  console.log(`${face.padEnd(20)} ${line.join(' | ')}`);
}

await browser.close();
server.close();
console.log(over ? `\n${over} still(s) over the mobile budget` : '\nAll stills within the mobile AVIF budget');
