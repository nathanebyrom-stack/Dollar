// Accessibility check with axe-core (WCAG 2.1 A and AA rules plus best practice). Dev-only.
//   node tools/check/a11y.mjs            every route, in several states
// Serves dist/ with the CSP from netlify.toml, then runs axe in headless Chromium on every route in pages.json at desktop
// and phone widths, with reduced motion, and (software WebGL forced on) with the live 3D scene on the pages that have one.
// WCAG violations, a horizontal scroll at 320 px, and best-practice findings all fail the run; "incomplete" results (axe could not
// decide, usually text over the 3D canvas) are listed for a manual look. Axe is injected by evaluation, which the CSP allows.
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
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const { pages } = JSON.parse(readFileSync(join(root, 'src', 'pages.json'), 'utf8'));
const csp = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(readFileSync(join(root, 'netlify.toml'), 'utf8'))[1].replace('; upgrade-insecure-requests', '');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' };

const server = http.createServer((req, res) => {
  let p = join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end(readFileSync(join(dist, '404.html'))); }
  res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'Accept-Ranges': 'bytes' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse() : [];
  for (const x of dirs) for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
    const p = join(cache, x, arch, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (existsSync(p)) return p;
  }
  return undefined;
}
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const RULES = { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } };
const wcag = (v) => v.tags.some((t) => /^wcag(2a|2aa|21a|21aa)$/.test(t));
let failing = 0;
const incompleteSeen = new Map();
const bestPractice = new Map();

async function run(label, route, { query = '', viewport, reducedMotion = false, prepare, reflow = false } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 }, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  await page.goto(base + route + query, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  if (prepare) await prepare(page);
  await page.evaluate(axeSource);
  const r = await page.evaluate((rules) => axe.run(document, rules), RULES);
  const bad = r.violations.filter(wcag);
  failing += bad.length;
  // WCAG 1.4.10 reflow: at 320 CSS px wide there must be no horizontal scrolling.
  if (reflow) {
    const wide = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
    if (wide.scrollWidth > wide.innerWidth) { failing++; console.log(`  FAIL a11y: ${route} [${label}]\n       1.4.10 reflow: scrollWidth ${wide.scrollWidth} > ${wide.innerWidth}`); await ctx.close(); return; }
  }
  for (const v of r.violations.filter((x) => !wcag(x))) bestPractice.set(`${v.id}: ${v.help}`, (bestPractice.get(`${v.id}: ${v.help}`) || new Set()).add(route));
  for (const v of r.incomplete) incompleteSeen.set(`${v.id}: ${v.help}`, (incompleteSeen.get(`${v.id}: ${v.help}`) || new Set()).add(route));
  if (bad.length) {
    console.log(`  FAIL a11y: ${route} [${label}]`);
    for (const v of bad) console.log(`       ${v.impact} ${v.id}: ${v.help}\n         ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}${v.nodes.length > 3 ? ` (+${v.nodes.length - 3} more)` : ''}`);
  } else console.log(`  ok   a11y: ${route} [${label}]`);
  await ctx.close();
}

const has3d = (p) => !!p.scene;
for (const p of pages) {
  await run('desktop', p.route);
  await run('phone 375', p.route, { viewport: { width: 375, height: 800 } });
  await run('reduced motion', p.route, { reducedMotion: true });
  await run('reflow 320', p.route, { viewport: { width: 320, height: 700 }, reflow: true });
  if (has3d(p)) await run('live 3D', p.route, { query: '?tier=high' });
}
// States that only exist mid-scroll: the Work gallery pinned, the Services panels, the graph, a case-study video in view.
await run('Work gallery pinned', '/', { query: '?tier=high', prepare: async (pg) => {
  await pg.waitForFunction(() => window.__scene && ScrollTrigger.getAll().some((s) => s.pin), null, { timeout: 40000 });
  await pg.evaluate(() => { const t = ScrollTrigger.getAll().find((s) => s.pin); scrollTo(0, t.start + (t.end - t.start) * 1.02); });
  await pg.waitForFunction(() => document.documentElement.classList.contains('gallery-3d'), null, { timeout: 40000 });
  await pg.evaluate(() => { const s = ScrollTrigger.getAll().filter((t) => t.pin)[1]; scrollTo(0, s.start + (s.end - s.start) * 0.5); });
  await pg.waitForTimeout(1500);
} });
await run('Services pinned (Low path)', '/', { prepare: async (pg) => {
  await pg.waitForFunction(() => ScrollTrigger.getAll().some((s) => s.pin), null, { timeout: 20000 });
  await pg.evaluate(() => { const t = ScrollTrigger.getAll().find((s) => s.pin); scrollTo(0, t.start + (t.end - t.start) * 0.5); });
  await pg.waitForTimeout(1200);
} });
await run('phone menu open', '/', { viewport: { width: 375, height: 812 }, prepare: async (pg) => { await pg.click('.site-nav__toggle'); } });
await run('phone menu open on a case study', '/work/fluid-process-uk/', { viewport: { width: 375, height: 812 }, prepare: async (pg) => { await pg.click('.site-nav__toggle'); } });
await run('graph animating', '/services/workflow-automation/', { prepare: async (pg) => {
  await pg.waitForFunction(() => document.documentElement.classList.contains('graph-on'), null, { timeout: 20000 });
  await pg.evaluate(() => { const x = ScrollTrigger.getAll().find((t) => t.trigger && t.trigger.id === 'scene-graph'); scrollTo(0, x.start + (x.end - x.start) * 0.5); });
  await pg.waitForTimeout(1000);
} });

await browser.close();
server.close();

if (bestPractice.size) { console.log('\nBest-practice findings (not WCAG failures):'); for (const [k, v] of bestPractice) console.log(`  - ${k} (${[...v].join(', ')})`); }
if (incompleteSeen.size) { console.log('\nAxe could not decide these (needs a manual look):'); for (const [k, v] of incompleteSeen) console.log(`  - ${k} (${[...v].slice(0, 6).join(', ')}${v.size > 6 ? ', ...' : ''})`); }
if (bestPractice.size) failing += bestPractice.size;
if (failing) { console.log(`\nA11Y CHECK FAILED: ${failing} violation(s) (WCAG, reflow or best practice)`); process.exit(1); }
console.log('\nA11Y CHECK PASSED: no WCAG 2.1 A/AA or best-practice violations found by axe, and no overflow at 320 px');
