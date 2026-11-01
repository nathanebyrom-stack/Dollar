// Keyboard walk-through and 200% zoom check (CHECKLIST Phase 8, Accessibility). Dev-only.
//   node tools/check/keyboard.mjs
// Serves dist/ with the CSP from netlify.toml and, in headless Chromium, on every route in pages.json at desktop and phone widths:
//  - the first Tab lands on the skip link, and Enter on it moves focus into <main>;
//  - Tab walks the whole page and comes back round (no focus trap), stopping on every focusable element exactly once;
//  - every stop is a real, on-screen element (a visible box, scrolled into the viewport) that shows a focus ring (an outline:
//    the site's :focus-visible rule, or failing that the browser's own; what this catches is an outline:none that hides it)
//    and, if it is a link, has an href;
//  - Shift+Tab from the first stop goes back to the last (the cycle works both ways).
// Then, for WCAG 1.4.4 (resize to 200%), every route is opened at the width a 1440 px and a 1280 px window have at 200% zoom
// (720 and 640 px): no horizontal scroll, the h1 and the header's navigation are on the page, and no text box is cut off
// by an overflow:hidden ancestor. (320 px reflow, 1.4.10, is in a11y.mjs.) A screen-reader pass is still a person's job.
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
const csp = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(readFileSync(join(root, 'netlify.toml'), 'utf8'))[1].replace('; upgrade-insecure-requests', '');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' };

const server = http.createServer((req, res) => {
  let p = join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end(readFileSync(join(dist, '404.html'))); }
  res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream', 'Content-Security-Policy': csp });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try { if (existsSync(chromium.executablePath())) return undefined; } catch { /* fall through */ }
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => parseInt(b.slice(9)) - parseInt(a.slice(9))) : [];
  for (const d of dirs) for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
    const p = join(cache, d, arch, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (existsSync(p)) return p;
  }
  return undefined;
}

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const failures = [];
const report = (name, ok, detail) => { if (ok) console.log(`  ok   ${name}`); else { failures.push(name); console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); } };
const routes = pages.map((p) => p.route).filter((r) => r !== '/404.html');

// What the browser says about the element that has focus right now.
const describe = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return { body: true };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  // The header and footer both link to /work/ etc., so the key carries the element's position in the document, not just its href.
  const key = `${[...document.querySelectorAll('*')].indexOf(el)}:` + el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.getAttribute('href') ? `[${el.getAttribute('href')}]` : '') + (el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : '');
  return {
    key, tag: el.tagName, href: el.getAttribute('href'),
    box: r.width > 0 && r.height > 0,
    onScreen: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
    ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
    inMain: !!el.closest('main'),
  };
};

for (const [label, viewport] of [['1440px', { width: 1440, height: 900 }], ['375px', { width: 375, height: 812 }]]) {
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + route, { waitUntil: 'load' });
    await page.waitForTimeout(800); // reveals and the scene's first frames

    // Skip link first, and it works.
    await page.keyboard.press('Tab');
    const first = await page.evaluate(describe);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const afterSkip = await page.evaluate(describe);
    report(`${route} @ ${label}: first Tab is the skip link and Enter moves focus into main`,
      /skip-link/.test(first.key || '') && first.onScreen && first.ring && afterSkip.inMain, JSON.stringify({ first, afterSkip }));

    // Walk the cycle from the top. A fresh load, so the skip link's jump to #main has not moved the point Tab starts from.
    await page.goto(base + route, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const stops = [];
    const bad = [];
    for (let i = 0; i < 400; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(40); // smooth scroll settles enough for the box to be measured
      const d = await page.evaluate(describe);
      if (d.body) break;                       // back round to the document
      if (stops.includes(d.key)) break;        // or back to the first stop (header menu etc.)
      stops.push(d.key);
      if (!d.box || !d.onScreen || !d.ring || (d.tag === 'A' && !d.href)) bad.push({ ...d });
    }
    // Rendered focusables only: the nine links inside the closed phone menu have no boxes (an ancestor is display:none) and are rightly skipped.
    const expected = await page.evaluate(() => [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((e) => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length > 0).length);
    report(`${route} @ ${label}: Tab visits ${stops.length} stops (${expected} focusable), each on screen with a focus ring, then comes round`,
      stops.length > 3 && stops.length >= expected - 1 && stops.length < 400 && bad.length === 0 && errors.length === 0,
      JSON.stringify({ stops: stops.length, expected, bad: bad.slice(0, 5), errors: errors.slice(0, 2) }));

    // Backwards from the top goes to the last stop.
    await page.goto(base + route, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(40);
    const back = await page.evaluate(describe);
    report(`${route} @ ${label}: Shift+Tab from the top wraps to the last stop`, back.key === stops[stops.length - 1] && back.onScreen, JSON.stringify({ back: back.key, last: stops[stops.length - 1] }));
    await ctx.close();
  }
}

// 200% zoom.
for (const [label, viewport] of [['1440 at 200%', { width: 720, height: 450 }], ['1280 at 200%', { width: 640, height: 400 }]]) {
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(base + route, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const clipped = [];
      for (const el of document.querySelectorAll('h1, h2, h3, p, li, a, button, label')) {
        if (!el.textContent.trim() || el.closest('[aria-hidden="true"]') || getComputedStyle(el).display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (!/hidden|clip/.test(cs.overflowX + cs.overflowY)) continue;
          const b = a.getBoundingClientRect();
          if (r.right > b.right + 1 || r.bottom > b.bottom + 1 || r.left < b.left - 1) { clipped.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}" by ${a.tagName.toLowerCase()}.${(a.className || '').toString().split(/\s+/)[0]}`); break; }
        }
      }
      return { overflow: document.documentElement.scrollWidth > innerWidth, h1: !!document.querySelector('h1')?.getBoundingClientRect().height, nav: !!document.querySelector('.site-header .site-nav, .site-header .site-nav__toggle'), clipped: clipped.slice(0, 5) };
    });
    report(`${route} @ ${label}: no horizontal scroll, h1 and navigation present, no text cut off`, !r.overflow && r.h1 && r.nav && r.clipped.length === 0, JSON.stringify(r));
    await ctx.close();
  }
}

await browser.close();
server.close();
if (failures.length) { console.log(`\nKEYBOARD CHECK FAILED: ${failures.length} problem(s)`); process.exit(1); }
console.log('\nKEYBOARD CHECK PASSED: skip link, full Tab cycle with visible focus on every route, and 200% zoom');
