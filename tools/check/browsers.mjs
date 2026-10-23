// Cross-browser check in WebKit (the Safari engine) and Firefox. Dev-only.
// NOT YET RUN: the WebKit and Firefox builds this needs were not installed when it was written (23 Oct 2026), so expect to
// fix small things the first time. The builds cached on the dev Mac were for an older Playwright and do not launch. Chromium is covered by smoke.mjs and a11y.mjs.
//   cd tools && npx playwright-core install webkit firefox   (once)
//   node check/browsers.mjs
// Serves dist/ with the CSP from netlify.toml. For each engine, at phone and desktop widths, every route must load with a
// 200, one h1, no console error, no CSP violation and no horizontal scroll; Home is also opened on each quality tier (the
// 3D scene must either run or fall back to the stills without an error), the phone menu must open and close, and the
// Services panels must be reachable. This is automation only: it is not a substitute for looking at the site on a real iPhone.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const dist = join(root, 'dist');
const require = createRequire(join(here, '..', 'package.json'));
const pw = require('playwright-core');
const { pages } = JSON.parse(readFileSync(join(root, 'src', 'pages.json'), 'utf8'));
const csp = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(readFileSync(join(root, 'netlify.toml'), 'utf8'))[1].replace('; upgrade-insecure-requests', '');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' };

// Range requests are honoured, because Safari will not play a video from a server that cannot answer them.
const server = http.createServer((req, res) => {
  let p = join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end(readFileSync(join(dist, '404.html'))); }
  const body = readFileSync(p);
  const headers = { 'Content-Type': types[extname(p)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'Accept-Ranges': 'bytes' };
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const start = m[1] ? +m[1] : 0; const end = m[2] ? Math.min(+m[2], body.length - 1) : body.length - 1;
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 });
    return res.end(body.subarray(start, end + 1));
  }
  res.writeHead(200, headers); res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const VIEWPORTS = [['phone 375', { width: 375, height: 812 }, true], ['desktop 1440', { width: 1440, height: 900 }, false]];
let problems = 0;
const say = (ok, msg, detail) => { if (!ok) problems++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}${!ok && detail ? `\n       ${detail}` : ''}`); };

for (const name of (process.argv[2] ? [process.argv[2]] : ['webkit', 'firefox'])) {
  console.log(`\n${name}`);
  let browser;
  try { browser = await pw[name].launch(); } catch (e) { say(false, `${name} could not launch`, String(e.message).split('\n')[0]); continue; }
  for (const [label, viewport, mobile] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport, hasTouch: mobile && name !== 'firefox', isMobile: mobile && name !== 'firefox' });
    // Every route.
    for (const p of pages) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
      await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
      const res = await page.goto(base + p.route, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, overflow: document.documentElement.scrollWidth - innerWidth, csp: window.__csp, tier: document.documentElement.dataset.tier || '' }));
      const expected = p.route === '/404.html' ? 404 : 200;
      say((res.status() === expected || p.route === '/404.html') && r.h1 === 1 && r.overflow <= 0 && !r.csp.length && !errors.length, `${label} ${p.route}${r.tier ? ` (tier ${r.tier})` : ''}`, JSON.stringify({ status: res.status(), ...r, errors }));
      await page.close();
    }
    // Home on each tier: the live scene runs, or it falls back to the stills quietly.
    for (const tier of ['high', 'mid', 'low']) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
      await page.goto(`${base}/?tier=${tier}`, { waitUntil: 'load' });
      await page.waitForTimeout(tier === 'low' ? 1500 : 5000);
      const r = await page.evaluate(() => ({ tier: document.documentElement.dataset.tier, live: document.documentElement.classList.contains('scene-live'), still: document.documentElement.classList.contains('scene-still'), pins: window.ScrollTrigger ? ScrollTrigger.getAll().filter((s) => s.pin).length : -1, overflow: document.documentElement.scrollWidth - innerWidth }));
      const worked = tier === 'low' ? r.still : r.live || r.still;
      say(worked && r.pins === 1 && r.overflow <= 0 && !errors.length, `${label} Home ?tier=${tier}: ${r.live ? 'live 3D' : r.still ? 'stills' : 'nothing'}${tier !== 'low' && !r.live ? ' (fell back)' : ''}`, JSON.stringify({ ...r, errors }));
      await page.close();
    }
    // Services panels reachable by keyboard (Low path, which every engine can run).
    {
      const page = await ctx.newPage();
      await page.goto(`${base}/?tier=low`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await page.focus('#scene-services .service-panel:nth-of-type(2) a');
      await page.waitForTimeout(600);
      const shown = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { w: r.width, inView: r.top >= 0 && r.bottom <= innerHeight, op: +getComputedStyle(a.closest('.service-panel')).opacity }; });
      say(shown.w > 0 && shown.inView && shown.op > 0.9, `${label} Services: focusing a panel's link brings it on screen`, JSON.stringify(shown));
      await page.close();
    }
    // Phone menu.
    if (mobile) {
      const page = await ctx.newPage();
      await page.goto(`${base}/about/`, { waitUntil: 'load' });
      await page.click('.site-nav__toggle');
      const open = await page.evaluate(() => ({ exp: document.querySelector('.site-nav__toggle').getAttribute('aria-expanded'), seen: [...document.querySelectorAll('.site-nav a')].filter((a) => a.getBoundingClientRect().width > 40).length }));
      await page.keyboard.press('Escape');
      const closed = await page.evaluate(() => document.querySelector('.site-nav__toggle').getAttribute('aria-expanded'));
      say(open.exp === 'true' && open.seen === 9 && closed === 'false', `${label} menu opens with all 9 links and Escape closes it`, JSON.stringify({ open, closed }));
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}
server.close();
console.log(problems ? `\nBROWSER CHECK FAILED: ${problems} problem(s)` : '\nBROWSER CHECK PASSED');
process.exit(problems ? 1 : 0);
