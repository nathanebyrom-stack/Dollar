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
  const info = await page.evaluate(async () => ({
    fonts: (await document.fonts.ready, [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/"/g, '')} ${f.weight}`)),
    preloads: [...document.querySelectorAll('link[rel="preload"][as="font"]')].map((l) => l.getAttribute('href').split('/').pop()),
    h1: document.querySelectorAll('h1').length,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    csp: window.__csp,
    hrefs: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h.startsWith('/') && !h.startsWith('//')),
    workLinks: ['.site-header', '.site-footer'].map((q) => !!document.querySelector(`${q} a[href="/work/"]`)),
    smooth: { lenis: !!window.__lenis, cls: document.documentElement.classList.contains('lenis'), st: typeof window.ScrollTrigger?.create },
    icons: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => l.getAttribute('href')),
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    logos: ['.site-header .site-logo img', '.site-footer .site-logo img'].map((q) => {
      const i = document.querySelector(q);
      return i && { src: i.getAttribute('src'), alt: i.alt, loaded: i.complete && i.naturalWidth > 0, w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height) };
    }),
  }));
  // D7: only Space Grotesk and Inter are preloaded; Chakra Petch is a fallback and must not load while the logo renders.
  const wantPreloads = ['inter-latin-wght-normal.woff2', 'space-grotesk-latin-700-normal.woff2'];
  if (JSON.stringify([...info.preloads].sort()) !== JSON.stringify(wantPreloads)) problems.push(`font preloads are ${JSON.stringify(info.preloads)}, want ${JSON.stringify(wantPreloads)}`);
  for (const f of ['Space Grotesk 700', 'Inter 100 900']) if (!info.fonts.includes(f)) problems.push(`font not loaded: ${f} (loaded: ${info.fonts.join(', ')})`);
  if (info.fonts.some((f) => f.startsWith('Chakra Petch'))) problems.push('Chakra Petch loaded although the logo plate renders (it is fallback only)');
  if (!info.workLinks[0]) problems.push('header has no link to /work/');
  if (!info.workLinks[1]) problems.push('footer has no link to /work/');
  // Smooth scroll: on in normal motion, off (native scroll) under prefers-reduced-motion.
  if (info.smooth.st !== 'function') problems.push('ScrollTrigger is not available');
  if (extra.reducedMotion && (info.smooth.lenis || info.smooth.cls)) problems.push('Lenis is active under prefers-reduced-motion');
  if (!extra.reducedMotion && !(info.smooth.lenis && info.smooth.cls)) problems.push(`Lenis is not running (instance ${info.smooth.lenis}, html.lenis ${info.smooth.cls})`);
  if (info.icons.length < 3) problems.push(`expected svg, png and apple-touch icon links, found ${info.icons.length}`);
  if (info.themeColor?.toLowerCase() !== '#0c0e11') problems.push(`theme-color is ${info.themeColor}, want #0C0E11`);
  info.logos.forEach((l, i) => {
    const where = i ? 'footer' : 'header';
    if (!l) problems.push(`${where} logo image missing`);
    else if (!l.loaded || !l.src.endsWith('34-automation-plate.svg') || l.alt !== '34 Automation') problems.push(`${where} logo not rendering the plate with alt text: ${JSON.stringify(l)}`);
    else if (l.w < 100 || l.h < 20) problems.push(`${where} logo rendered too small: ${l.w}x${l.h}`);
  });
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

// ---- The 3D scene on Home (ARCHITECTURE sections 5, 6, 14). Software WebGL is forced on so the tiers can be exercised.
async function sceneChecks() {
  const gl = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (query, opts = {}) => {
    const ctx = await gl.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference', javaScriptEnabled: opts.js !== false });
    const page = await ctx.newPage();
    const errors = [];
    const warnings = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning' && /^Scene:/.test(m.text())) warnings.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
    await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
    await page.goto(base + '/' + query, { waitUntil: 'load' });
    return { ctx, page, errors, warnings };
  };
  const started = (page) => page.waitForFunction(() => window.__scene && window.__scene.frames > 3, null, { timeout: 40000 });
  const report = async (name, t, cond, detail) => {
    const bad = [...t.errors, ...(await t.page.evaluate(() => window.__csp)).map((v) => `CSP violation: ${v}`)];
    if (cond && !bad.length) console.log(`  ok   scene: ${name}`);
    else { fail(`scene: ${name}`); [detail, ...bad].filter(Boolean).forEach((m) => console.log(`       ${m}`)); }
  };

  for (const tier of ['high', 'mid']) {
    for (const [label, viewport] of viewports) {
      const t = await open(`?tier=${tier}`, { viewport });
      await started(t.page);
      await t.page.waitForTimeout(1500);
      const r = await t.page.evaluate(() => ({
        tier: document.documentElement.dataset.tier, on: document.documentElement.classList.contains('scene-on'),
        canvas: !!document.querySelector('.scene-stage canvas.is-ready'), overflow: document.documentElement.scrollWidth > innerWidth,
        h1: document.querySelectorAll('h1').length, pins: ScrollTrigger.getAll().filter((s) => s.pin).length,
      }));
      await report(`?tier=${tier} @ ${label} renders, scene-on, one pin`, t, r.tier === tier && r.on && r.canvas && !r.overflow && r.h1 === 1 && r.pins === 1, JSON.stringify(r));
      await t.ctx.close();
    }
  }

  // Where, as a scroll offset, a fraction of the pinned Services section falls.
  const pinAt = (page, f) => page.evaluate((f) => { const t = ScrollTrigger.getAll().find((s) => s.pin); return t.start + (t.end - t.start) * f; }, f);
  const activeFace = (page) => page.evaluate(() => [...document.querySelectorAll('.die-still.is-active')].map((e) => e.dataset.face).join(','));
  const settle = (page) => page.waitForTimeout(900); // the crossfade classes flip at once; give ScrollTrigger a beat

  { // Low path: no WebGL work, the stills carry the page and the faces change by crossfade (stills.js).
    const t = await open('');
    await t.page.waitForFunction(() => document.documentElement.classList.contains('scene-still'), null, { timeout: 15000 });
    const r = await t.page.evaluate(() => ({
      tier: document.documentElement.dataset.tier, canvas: !!document.querySelector('.scene-stage canvas'),
      on: document.documentElement.classList.contains('scene-on'), pins: ScrollTrigger.getAll().filter((s) => s.pin).length,
      stills: document.querySelectorAll('.die-still').length, frameVisible: getComputedStyle(document.querySelector('.die-frame')).visibility === 'visible',
      front: (() => { const i = document.querySelector('.die-still[data-face="34"] img'); return i.complete && i.naturalWidth > 0; })(),
    }));
    await report('Low (software renderer): stills shown, no canvas, one pin', t, r.tier === 'low' && !r.canvas && r.on && r.pins === 1 && r.stills === 4 && r.frameVisible && r.front, JSON.stringify(r));

    const faces = [];
    for (const f of [0, 0.34, 0.6, 0.88]) { await t.page.evaluate((y) => scrollTo(0, y), f === 0 ? 0 : await pinAt(t.page, f)); await settle(t.page); faces.push(await activeFace(t.page)); }
    await report('Low: scrolling the pin steps the face 34 > web > marketing > automation', t, faces.join(' | ') === '34 | web-design | marketing | workflow-automation', faces.join(' | '));
    const states = await t.page.evaluate(() => ({ panel: [...document.querySelectorAll('.service-panel')].map((p) => p.classList.contains('is-active')), services: document.querySelector('.die-frame').classList.contains('is-services') }));
    await report('Low: the last service panel is shown and the die has moved over for Services', t, states.panel.join() === 'false,false,true' && states.services, JSON.stringify(states));
    await t.page.evaluate(() => document.getElementById('scene-work').scrollIntoView());
    await settle(t.page);
    const gone = await t.page.evaluate(() => document.querySelector('.die-frame').classList.contains('is-away'));
    await report('Low: the die fades away when Work arrives', t, gone);
    await t.ctx.close();
  }

  { // Reduced motion: nothing pinned or scrubbed or moved; the face still changes by crossfade (opacity only).
    const t = await open('', { reducedMotion: true });
    await t.page.waitForFunction(() => document.documentElement.classList.contains('scene-still'), null, { timeout: 15000 });
    const r = await t.page.evaluate(() => ({
      tier: document.documentElement.dataset.tier, canvas: !!document.querySelector('.scene-stage canvas'),
      on: document.documentElement.classList.contains('scene-on'), pins: ScrollTrigger.getAll().filter((s) => s.pin).length, lenis: !!window.__lenis,
      panelsVisible: [...document.querySelectorAll('.service-panel')].every((p) => getComputedStyle(p).visibility === 'visible' && getComputedStyle(p).opacity === '1'),
      fade: getComputedStyle(document.querySelector('.die-still')).transitionDuration, h1: document.querySelectorAll('h1').length,
    }));
    await report('Reduced motion: stills, no pin, no Lenis, services listed in full, 0.5s opacity crossfade', t, r.tier === 'low' && !r.canvas && !r.on && r.pins === 0 && !r.lenis && r.panelsVisible && r.fade === '0.5s' && r.h1 === 1, JSON.stringify(r));
    const faces = [];
    for (const i of [0, 1, 2]) {
      await t.page.evaluate((i) => { const p = document.querySelectorAll('.service-panel')[i]; scrollTo(0, p.getBoundingClientRect().top + scrollY - innerHeight / 2 + p.offsetHeight / 2); }, i);
      await settle(t.page); faces.push(await activeFace(t.page));
    }
    await report('Reduced motion: each face crossfades in as its panel reaches the middle of the screen', t, faces.join(' | ') === 'web-design | marketing | workflow-automation', faces.join(' | '));
    await t.ctx.close();
  }

  { // ?tier=low forced, and a browser with no WebGL at all: both are the stills path, with no console errors.
    const t = await open('?tier=low');
    await t.page.waitForFunction(() => document.documentElement.classList.contains('scene-still'), null, { timeout: 15000 });
    let r = await t.page.evaluate(() => ({ tier: document.documentElement.dataset.tier, canvas: !!document.querySelector('.scene-stage canvas'), stills: document.querySelectorAll('.die-still').length }));
    await report('?tier=low forced: stills, no canvas', t, r.tier === 'low' && !r.canvas && r.stills === 4, JSON.stringify(r));
    await t.ctx.close();

    const nogl = await chromium.launch({ executablePath: findChromium(), args: ['--disable-3d-apis'] });
    const ctx = await nogl.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('scene-still'), null, { timeout: 15000 });
    r = await page.evaluate(() => ({ webgl: !!document.createElement('canvas').getContext('webgl2'), tier: document.documentElement.dataset.tier, canvas: !!document.querySelector('.scene-stage canvas'), stills: document.querySelectorAll('.die-still').length }));
    if (!r.webgl && r.tier === 'low' && !r.canvas && r.stills === 4 && !errors.length) console.log('  ok   scene: no WebGL at all: stills, no canvas, no errors');
    else { fail('scene: no WebGL at all falls back to the stills'); console.log(`       ${JSON.stringify({ ...r, errors })}`); }
    await nogl.close();
  }

  { // JavaScript off: the "34" still is in the page itself and the services read in full.
    const t = await open('', { js: false });
    await t.page.waitForLoadState('load');
    const r = await t.page.evaluate(() => ({
      on: document.documentElement.classList.contains('scene-on'),
      still: (() => { const i = document.querySelector('.die-still[data-face="34"] img'); return i.complete && i.naturalWidth > 0; })(),
      stills: document.querySelectorAll('.die-still').length,
      panels: [...document.querySelectorAll('.service-panel')].every((p) => getComputedStyle(p).visibility === 'visible' && getComputedStyle(p).opacity === '1'),
      links: document.querySelectorAll('.service-panel a').length, heroH: Math.round(document.getElementById('scene-hero').getBoundingClientRect().height), vh: innerHeight,
    }));
    await report('no JS: the "34" still shows, every service panel is visible, nothing is pinned', t, !r.on && r.still && r.stills === 1 && r.panels && r.links === 3 && r.heroH <= r.vh * 1.01, JSON.stringify(r));
    await t.ctx.close();
  }

  { // Live scene: the still hands over and visitors never download the other three.
    const t = await open('?tier=high');
    const fetched = [];
    t.page.on('request', (rq) => { if (/\/die-(web-design|marketing|workflow-automation)-/.test(rq.url())) fetched.push(rq.url()); });
    await started(t.page);
    await t.page.waitForTimeout(1500);
    const r = await t.page.evaluate(() => ({ live: document.documentElement.classList.contains('scene-live'), frame: getComputedStyle(document.querySelector('.die-frame')).visibility, stills: document.querySelectorAll('.die-still').length }));
    await report('Live scene: the still hands over to the die and the other stills are never fetched', t, r.live && r.frame === 'hidden' && r.stills === 1 && fetched.length === 0, JSON.stringify({ ...r, fetched }));
    await t.ctx.close();
  }

  { // Failure paths hand over to the stills, with exactly one pin (the live timelines must be reverted, not left to fight).
    const fellBack = (page) => page.evaluate(() => ({
      tier: document.documentElement.dataset.tier, canvas: !!document.querySelector('.scene-stage canvas'),
      live: document.documentElement.classList.contains('scene-live'), still: document.documentElement.classList.contains('scene-still'),
      pins: ScrollTrigger.getAll().filter((s) => s.pin).length, stills: document.querySelectorAll('.die-still').length,
      frame: getComputedStyle(document.querySelector('.die-frame')).visibility,
    }));
    const ok = (r) => r.tier === 'low' && !r.canvas && !r.live && r.still && r.pins === 1 && r.stills === 4 && r.frame === 'visible';

    let t = await open('?tier=high');
    await started(t.page);
    await t.page.waitForFunction(() => ScrollTrigger.getAll().some((s) => s.pin)); // the live timelines are built
    await t.page.evaluate(() => window.__scene.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await t.page.waitForTimeout(1200);
    let r = await fellBack(t.page);
    await report('lost WebGL context hands over to the stills', t, ok(r) && t.warnings.some((w) => /context lost/.test(w)), JSON.stringify({ ...r, warnings: t.warnings }));
    await t.ctx.close();

    t = await open('?tier=high');
    await started(t.page);
    await t.page.waitForFunction(() => ScrollTrigger.getAll().some((s) => s.pin));
    await t.page.evaluate(() => window.__scene.dropTier('test'));
    await t.page.waitForTimeout(800);
    const frames = await t.page.evaluate(() => window.__scene.frames);
    await t.page.waitForTimeout(800);
    r = await t.page.evaluate((f) => ({ tier: document.documentElement.dataset.tier, rendering: window.__scene.frames > f, canvas: !!document.querySelector('.scene-stage canvas') }), frames);
    await report('runtime drop High -> Mid keeps rendering', t, r.tier === 'mid' && r.rendering && r.canvas, JSON.stringify(r));
    await t.page.evaluate(() => window.__scene.dropTier('test'));
    await t.page.waitForTimeout(1200);
    r = await fellBack(t.page);
    await report('runtime drop Mid -> Low hands over to the stills', t, ok(r), JSON.stringify(r));
    await t.ctx.close();

    // The stage module itself fails to load (network, parse error): one console error, and the stills carry the page.
    const ctx = await gl.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.route('**/scene/stage.js', (rt) => rt.abort());
    await page.goto(`${base}/?tier=high`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('scene-still'), null, { timeout: 15000 });
    r = await fellBack(page);
    const logged = errors.filter((e) => /Scene: could not start/.test(e)).length;
    if (ok(r) && logged === 1) console.log('  ok   scene: stage.js failing to load falls back to the stills with one logged error');
    else { fail('scene: stage.js failing to load falls back to the stills'); console.log(`       ${JSON.stringify({ ...r, logged, errors })}`); }
    await ctx.close();
  }
  await gl.close();
}
await sceneChecks();

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

// Vendored ES modules must not use bare specifiers ('three'): they need an import map, which the CSP forbids.
for (const f of walk(join(dist, 'assets', 'vendor')).filter((x) => /three-r186.*\.js$/.test(x))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*["']([^"'.\/][^"']*)["']/g)) fail(`${f}: bare module specifier "${m[1]}"`);
}

await browser.close();
server.close();
if (failures.length) { console.log(`\nSMOKE FAILED: ${failures.length} problem(s)`); process.exit(1); }
console.log('\nSMOKE PASSED');
