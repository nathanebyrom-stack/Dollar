// Headless smoke check for dist/ (ARCHITECTURE §14). Dev-only; never deployed.
//   node scripts/build.mjs && node tools/check/smoke.mjs
// Serves dist/ locally with the Content-Security-Policy taken from netlify.toml, then for every route
// in src/pages.json and at 375 px and 1440 px checks: HTTP 200, exactly one <h1>, no console errors, no
// page errors, no failed or 4xx/5xx requests, no CSP violations, no horizontal overflow. Also checks
// internal links resolve, runs the routes again with reduced motion emulated, and scans the built output
// for the background rule (§15) and the banned words.
// Browser: CHROMIUM_PATH if set, else Playwright's own, else the newest cached Playwright Chromium.
import http from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const dist = join(root, 'dist');
const require = createRequire(join(here, '..', 'package.json'));
const { chromium } = require('playwright-core');

const { pages } = JSON.parse(readFileSync(join(root, 'src', 'pages.json'), 'utf8'));
const csp = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(readFileSync(join(root, 'netlify.toml'), 'utf8'))?.[1];
if (!csp) throw new Error('No Content-Security-Policy found in netlify.toml');

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const p = join(dist, clean);
  if (!p.startsWith(dist)) return null;
  if (existsSync(p) && statSync(p).isFile()) return p;
  const idx = join(p, 'index.html');
  return existsSync(idx) ? idx : null;
}

// Netlify serves an unknown path as 404 with 404.html.
const server = http.createServer((req, res) => {
  const file = resolveFile(req.url);
  const headers = { 'Content-Security-Policy': csp.replace('; upgrade-insecure-requests', '').replace('upgrade-insecure-requests; ', '') };
  if (file) {
    res.writeHead(200, { ...headers, 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } else {
    res.writeHead(404, { ...headers, 'Content-Type': types['.html'] });
    res.end(existsSync(join(dist, '404.html')) ? readFileSync(join(dist, '404.html')) : 'Not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try { if (existsSync(chromium.executablePath())) return undefined; } catch { /* fall through */ }
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!existsSync(cache)) return undefined;
  const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => parseInt(b.slice(9)) - parseInt(a.slice(9)));
  for (const d of dirs) {
    const arm = join(cache, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    const x64 = join(cache, d, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (existsSync(arm)) return arm;
    if (existsSync(x64)) return x64;
  }
  return undefined;
}

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL ${msg}`); };

const browser = await chromium.launch({ executablePath: findChromium() });
const links = new Map(); // internal href -> first page it was seen on

async function checkPage(route, viewport, label, extra = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: extra.reducedMotion ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const problems = [];
  // Browsers ask for /favicon.ico on their own; whether a page declares an icon is asserted separately.
  await page.route('**/favicon.ico', (r) => r.fulfill({ status: 204 }));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) problems.push(`HTTP ${r.status()}: ${r.url()}`); });

  const res = await page.goto(base + route, { waitUntil: 'networkidle' });
  const want = route === '/404.html' ? 200 : 200;
  if (res.status() !== want) problems.push(`status ${res.status()}`);
  const info = await page.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    csp: window.__csp,
    hrefs: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h.startsWith('/') && !h.startsWith('//')),
  }));
  if (info.h1 !== 1) problems.push(`${info.h1} <h1> elements (want 1)`);
  if (info.scrollWidth > info.innerWidth) problems.push(`horizontal overflow: scrollWidth ${info.scrollWidth} > ${info.innerWidth}`);
  for (const v of info.csp) problems.push(`CSP violation: ${v}`);
  for (const h of info.hrefs) if (!links.has(h)) links.set(h, route);
  if (extra.after) await extra.after(page, problems);
  await ctx.close();
  if (problems.length) { fail(`${route} @ ${label}`); problems.forEach((p) => console.log(`       ${p}`)); }
  else console.log(`  ok   ${route} @ ${label}`);
}

const viewports = [['375px', { width: 375, height: 800 }], ['1440px', { width: 1440, height: 900 }]];
for (const p of pages) for (const [label, vp] of viewports) await checkPage(p.route, vp, label);
for (const p of pages) await checkPage(p.route, { width: 1440, height: 900 }, '1440px reduced-motion', { reducedMotion: true });

// Internal links.
for (const [href, from] of links) {
  const path = href.split('#')[0];
  if (!path) continue;
  const r = await fetch(base + path);
  if (r.status !== 200) fail(`broken link ${href} (on ${from}): ${r.status}`);
}

// Unknown paths 404.
{
  const r = await fetch(base + '/no-such-page/');
  if (r.status !== 404) fail(`unknown path returned ${r.status}, want 404`);
}

// Background rule (§15) and banned words in the built output.
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const f of walk(dist)) {
  const ext = extname(f);
  if (ext === '.css') {
    const css = readFileSync(f, 'utf8');
    if (/repeating-(linear|radial|conic)-gradient/i.test(css)) fail(`${f}: repeating gradient (banned background pattern)`);
    if (/background-size\s*:/i.test(css)) fail(`${f}: background-size (tiled pattern check; review by hand)`);
    if (/PROVISIONAL/.test(css)) fail(`${f}: PROVISIONAL mark still present`);
  }
  if (['.html', '.css', '.js', '.json', '.md'].includes(ext) && !f.includes(`${join('dist', 'assets', 'vendor')}`)) {
    const text = readFileSync(f, 'utf8');
    if (/\bFrank\b/.test(text)) fail(`${f}: contains "Frank"`);
    if (/Reabrook/i.test(text)) fail(`${f}: contains "Reabrook"`);
  }
}

await browser.close();
server.close();
if (failures.length) { console.log(`\nSMOKE FAILED: ${failures.length} problem(s)`); process.exit(1); }
console.log('\nSMOKE PASSED');
