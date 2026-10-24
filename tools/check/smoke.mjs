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
  // The privacy policy's drafting notes say the site loads nothing third-party and sets no cookies or storage; keep that true.
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) problems.push(`third-party request: ${r.url()}`); });
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
  const stored = await page.evaluate(() => ({ cookies: document.cookie, local: localStorage.length, session: sessionStorage.length }));
  const cookies = await ctx.cookies();
  if (cookies.length || stored.cookies || stored.local || stored.session) problems.push(`the site stored something: ${JSON.stringify({ cookies: cookies.map((c) => c.name), ...stored })}`);
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

  // ---- Work cards and the 3D gallery (Phase 3) ----
  const cardState = (page) => page.evaluate(() => ({
    gallery: document.documentElement.classList.contains('gallery-3d'), mode: document.documentElement.dataset.videos || '',
    pins: ScrollTrigger.getAll().filter((s) => s.pin).length, frames: window.__scene && window.__scene.gallery ? window.__scene.gallery.frames.length : 0,
    playing: [...document.querySelectorAll('.work-card__video')].filter((v) => !v.paused && v.getAttribute('src')).length,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  const toGallery = async (page, f) => { await page.waitForFunction(() => ScrollTrigger.getAll().some((s) => s.pin)); await page.evaluate((y) => scrollTo(0, y), await pinAt(page, 1.02)); await page.waitForFunction(() => window.__scene && window.__scene.gallery && document.documentElement.classList.contains('gallery-3d'), null, { timeout: 30000 }); await page.waitForTimeout(500);
    await page.evaluate((f) => { const s = ScrollTrigger.getAll().filter((t) => t.pin)[1]; scrollTo(0, s.start + (s.end - s.start) * f); }, f); await page.waitForTimeout(1500); };

  for (const tier of ['high', 'mid']) {
    const t = await open(`?tier=${tier}`);
    await started(t.page);
    await toGallery(t.page, 0.5);
    let r = await cardState(t.page);
    await report(`Work gallery (${tier}): pinned, three frames, at most two videos playing`, t, r.gallery && r.pins === 2 && r.frames === 3 && r.playing <= 2 && r.mode === '', JSON.stringify(r));
    // The row of cards is wider than the screen, so check for page overflow at the start, middle and end of the pin
    // (it once showed only at the ends: a grid column growing with the row).
    const widths = [];
    for (const f of [0, 0.5, 1]) { await toGallery(t.page, f); widths.push(await t.page.evaluate(() => document.documentElement.scrollWidth - innerWidth)); }
    await report(`Work gallery (${tier}): no horizontal overflow at the start, middle and end of the pin`, t, widths.every((w) => w <= 0), `scrollWidth - innerWidth at 0 / 0.5 / 1: ${widths.join(' / ')}`);
    await toGallery(t.page, 1);
    r = await t.page.evaluate(() => ({ moss: (() => { const v = document.querySelector('.work-card[data-project="moss-and-memory"] .work-card__video'); const b = v.getBoundingClientRect(); return { playing: !v.paused && !!v.getAttribute('src'), onScreen: b.right > 0 && b.left < innerWidth }; })(), fpuk: (() => { const v = document.querySelector('.work-card[data-project="fluid-process-uk"] .work-card__video'); return !v; })() }));
    await report(`Work gallery (${tier}): the Moss & Memory recording plays while its card is on screen`, t, r.moss.onScreen && r.moss.playing, JSON.stringify(r));

    // Keyboard: focusing the last card while the gallery is at its start must bring that card into view.
    await t.page.evaluate(() => { const s = ScrollTrigger.getAll().filter((x) => x.pin)[1]; scrollTo(0, s.start + 5); });
    await t.page.waitForTimeout(1200);
    await t.page.evaluate(() => document.querySelector('.work-card[data-project="moss-and-memory"] .work-card__title a').focus());
    await t.page.waitForTimeout(1500);
    r = await t.page.evaluate(() => { const b = document.querySelector('.work-card[data-project="moss-and-memory"] .work-card__media').getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), vw: innerWidth }; });
    await report(`Work gallery (${tier}): focusing an off-screen card scrolls it into view`, t, r.left >= 0 && r.right <= r.vw + 1, JSON.stringify(r));
    await t.ctx.close();
  }

  { // Under 900 px the cards are a plain vertical list (D3), and widening again brings the gallery back.
    const t = await open('?tier=mid', { viewport: { width: 1200, height: 800 } });
    await started(t.page);
    await toGallery(t.page, 0.2);
    await t.page.setViewportSize({ width: 800, height: 800 });
    await t.page.waitForTimeout(1500);
    let r = await cardState(t.page);
    const col = await t.page.evaluate(() => { const c = [...document.querySelectorAll('.work-card')].map((x) => x.getBoundingClientRect()); return c.every((b) => Math.abs(b.left - c[0].left) < 2); });
    await report('Work cards: under 900 px the gallery is off and the cards are a single column', t, !r.gallery && r.pins === 1 && col && !r.overflow, JSON.stringify({ ...r, col }));
    await t.page.setViewportSize({ width: 1200, height: 800 });
    await t.page.waitForTimeout(2000);
    r = await cardState(t.page);
    await report('Work cards: widening again brings the gallery back', t, r.gallery && r.pins === 2, JSON.stringify(r));
    await t.ctx.close();
  }

  { // Falling back from 3D hands the cards back as a list with play-on-tap.
    const t = await open('?tier=high');
    await started(t.page);
    await toGallery(t.page, 0.3);
    await t.page.evaluate(() => window.__scene.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await t.page.waitForTimeout(1500);
    const r = await cardState(t.page);
    await report('Work cards: losing the 3D context returns the list with play-on-tap and one pin', t, !r.gallery && r.pins === 1 && r.mode === 'tap' && r.frames === 0, JSON.stringify(r));
    await t.ctx.close();
  }

  { // Low and reduced motion: play on tap, one video at a time, nothing starts by itself.
    for (const [name, opts] of [['Low', {}], ['reduced motion', { reducedMotion: true }]]) {
      const t = await open('', opts);
      await t.page.waitForFunction(() => document.documentElement.classList.contains('scene-still'), null, { timeout: 15000 });
      await t.page.evaluate(() => document.getElementById('scene-work').scrollIntoView({ block: 'center' }));
      await t.page.waitForTimeout(1500);
      let r = await cardState(t.page);
      const btn = await t.page.evaluate(() => { const b = document.querySelector('.work-card[data-project="moss-and-memory"] .work-card__play'); return { visible: getComputedStyle(b).display !== 'none' }; });
      await report(`Work cards (${name}): a Play button shows and nothing plays by itself`, t, r.mode === 'tap' && r.playing === 0 && btn.visible && !r.gallery, JSON.stringify({ ...r, ...btn }));
      await t.page.click('.work-card[data-project="moss-and-memory"] .work-card__play');
      await t.page.waitForTimeout(1500);
      r = await t.page.evaluate(() => { const v = document.querySelector('.work-card[data-project="moss-and-memory"] .work-card__video'); return { playing: !v.paused && !!v.getAttribute('src'), flagged: v.closest('.work-card__media').classList.contains('is-playing'), url: location.pathname }; });
      await report(`Work cards (${name}): tapping Play starts that video and does not open the case study`, t, r.playing && r.flagged && r.url === '/', JSON.stringify(r));
      await t.ctx.close();
    }
  }

  { // Content rules: badge text, outbound links only on Live, no media invented.
    const t = await open('?tier=low');
    const r = await t.page.evaluate(() => ({
      badges: [...document.querySelectorAll('.work-card')].map((c) => `${c.dataset.project}=${c.querySelector('.badge').textContent}`),
      outbound: [...document.querySelectorAll('.work-list a[href^="http"]')].map((a) => `${a.closest('.work-card').dataset.project}>${new URL(a.href).hostname}`),
      placeholders: [...document.querySelectorAll('.work-card__media--placeholder')].length,
    }));
    await report('Work cards: honest status badges, an outbound link only on the Live project, placeholders where no recording exists', t,
      r.badges.join() === 'fluid-process-uk=Live,aoe-engineering=In build,moss-and-memory=Concept' && r.outbound.join() === 'fluid-process-uk>www.fluidprocess.co.uk' && r.placeholders === 2, JSON.stringify(r));
    await t.ctx.close();
  }

  // ---- Service pages and the automation graph (Phase 4) ----
  const SERVICES = [['services/web-design/', 'web-design', 'top', 1], ['services/marketing/', 'marketing', 'back', 2], ['services/workflow-automation/', 'workflow-automation', 'bottom', 3]];

  for (const [route, face, glowKey, roll] of SERVICES) {
    { // Live: the die rests on this service's face (no rolls, no pins) and fades as the hero leaves.
      const t = await open(`${route}?tier=high`);
      await started(t.page);
      await t.page.waitForTimeout(800);
      const at = await t.page.evaluate(() => ({ roll: window.__scene.state.roll, glow: window.__scene.state.glow, yawMix: window.__scene.state.yawMix, pins: ScrollTrigger.getAll().filter((x) => x.pin).length, live: document.documentElement.classList.contains('scene-live') }));
      await t.page.evaluate(() => scrollTo(0, 1400));
      await t.page.waitForTimeout(1800);
      const gone = await t.page.evaluate(() => window.__scene.state.fade);
      await report(`${route} (live): rests on the ${face} face, no pins, the die fades as the hero leaves`, t, at.roll === roll && at.glow[glowKey] === 1 && at.yawMix === 1 && at.pins === 0 && at.live && gone > 0.95, JSON.stringify({ ...at, gone }));
      await t.ctx.close();
    }
    for (const [name, opts] of [['Low', {}], ['reduced motion', { reducedMotion: true }]]) {
      const t = await open(route, opts);
      const fetched = [];
      t.page.on('request', (rq) => { const m = /\/die-([a-z0-9-]+)-\d+\./.exec(rq.url()); if (m && m[1] !== face) fetched.push(m[1]); });
      await t.page.waitForFunction(() => document.documentElement.classList.contains('scene-still'), null, { timeout: 15000 });
      await t.page.reload({ waitUntil: 'load' });
      await t.page.waitForFunction(() => document.documentElement.classList.contains('scene-still'), null, { timeout: 15000 });
      const r = await t.page.evaluate(() => ({ stills: [...document.querySelectorAll('.die-still')].map((e) => e.dataset.face), active: [...document.querySelectorAll('.die-still.is-active')].map((e) => e.dataset.face), canvas: !!document.querySelector('.scene-stage canvas'), h1: document.querySelectorAll('h1').length }));
      await t.page.evaluate(() => scrollTo(0, 1400));
      await t.page.waitForTimeout(1200);
      const away = await t.page.evaluate(() => document.querySelector('.die-frame').classList.contains('is-away'));
      await report(`${route} (${name}): only the ${face} still, no canvas, no other face fetched, fades away after the hero`, t, r.stills.join() === face && r.active.join() === face && !r.canvas && fetched.length === 0 && away && r.h1 === 1, JSON.stringify({ ...r, away, fetched }));
      await t.ctx.close();
    }
  }

  // The automation graph: generated HTML, fully lit by default; animated by graph.js only when motion is allowed.
  const graphState = (page) => page.evaluate(() => {
    const visible = [...document.querySelectorAll('.graph')].filter((g) => getComputedStyle(g).display !== 'none');
    const svg = visible[0];
    return { svgs: document.querySelectorAll('.graph').length, visible: visible.length, kind: svg ? (svg.classList.contains('graph--tall') ? 'tall' : 'wide') : null,
      lit: svg ? [...svg.querySelectorAll('.graph__lit')].map((e) => (+getComputedStyle(e).opacity > 0.5 ? 1 : 0)).join('') : '',
      on: document.documentElement.classList.contains('graph-on'), triggers: ScrollTrigger.getAll().filter((x) => x.trigger && x.trigger.id === 'scene-graph').length,
      // Is the graph actually on screen? (Its scroll range once pointed at the wrong place: it lit up while off screen.)
      inView: svg ? (() => { const r = svg.getBoundingClientRect(); return r.top >= -2 && r.bottom <= innerHeight + 2 && r.height > 0; })() : false,
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
  const graphAt = (page, f) => page.evaluate((f) => { const x = ScrollTrigger.getAll().find((t) => t.trigger && t.trigger.id === 'scene-graph'); scrollTo(0, x.start + (x.end - x.start) * f); }, f);

  for (const route of ['', 'services/workflow-automation/']) {
    const label = route || 'Home';
    { const t = await open(route, { js: false });
      const r = await t.page.evaluate(() => ({ svgs: document.querySelectorAll('.graph').length, nodes: document.querySelectorAll('.graph--wide .graph__node').length, lit: [...document.querySelectorAll('.graph--wide .graph__lit')].map((e) => +getComputedStyle(e).opacity).join(''), on: document.documentElement.classList.contains('graph-on'), role: document.querySelector('.graph--wide').getAttribute('role'), title: document.querySelector('.graph--wide title').textContent }));
      await report(`${label}: graph is in the page with no JS, every node lit, with a text alternative`, t, r.svgs === 2 && r.nodes === 5 && r.lit === '11111' && !r.on && r.role === 'img' && r.title.length > 0, JSON.stringify(r));
      await t.ctx.close(); }
    { const t = await open(route);
      await t.page.waitForFunction(() => document.documentElement.classList.contains('graph-on'), null, { timeout: 15000 });
      await t.page.waitForTimeout(500);
      await graphAt(t.page, 0); await t.page.waitForTimeout(900); const start = await graphState(t.page);
      await graphAt(t.page, 0.5); await t.page.waitForTimeout(900); const mid = await graphState(t.page);
      await graphAt(t.page, 1); await t.page.waitForTimeout(900); const end = await graphState(t.page);
      const count = (x) => x.lit.split('').filter((c) => c === '1').length;
      await report(`${label}: graph lights node by node as you scroll (wide layout), none at the start, all at the end, one layout shown`, t, start.kind === 'wide' && start.visible === 1 && count(start) === 0 && count(mid) > 0 && count(mid) < 5 && count(end) === 5 && !end.overflow && start.inView && mid.inView && end.inView, JSON.stringify({ start, mid, end }));
      await t.ctx.close(); }
    { const t = await open(route, { reducedMotion: true });
      await t.page.waitForTimeout(1500);
      const r = await graphState(t.page);
      await report(`${label}: under reduced motion the graph is static and fully lit`, t, r.lit === '11111' && !r.on && r.triggers === 0, JSON.stringify(r));
      await t.ctx.close(); }
    { const t = await open(route, { viewport: { width: 375, height: 800 } });
      await t.page.waitForFunction(() => document.documentElement.classList.contains('graph-on'), null, { timeout: 15000 });
      await t.page.waitForTimeout(500);
      await graphAt(t.page, 0); await t.page.waitForTimeout(900); const start = await graphState(t.page);
      await graphAt(t.page, 1); await t.page.waitForTimeout(900); const end = await graphState(t.page);
      await report(`${label}: on a phone the tall layout is shown, animates, and does not overflow`, t, start.kind === 'tall' && start.visible === 1 && start.lit === '00000' && end.lit === '11111' && !end.overflow && start.inView && end.inView, JSON.stringify({ start, end }));
      await t.ctx.close(); }
  }

  // ---- Accessibility (Phase 8): everything reachable by keyboard, even in the pinned, stacked states ----
  for (const [name, query] of [['Low path', ''], ['live 3D', '?tier=high']]) {
    const t = await open(query);
    if (query) await started(t.page);
    await t.page.waitForFunction(() => ScrollTrigger.getAll().some((x) => x.pin), null, { timeout: 30000 });
    await t.page.waitForTimeout(600);
    const reached = [];
    const shown = [];
    await t.page.evaluate(() => document.getElementById('scene-hero').focus?.());
    for (let i = 0; i < 60 && reached.length < 3; i++) {
      await t.page.keyboard.press('Tab');
      await t.page.waitForTimeout(150);
      const at = await t.page.evaluate(() => { const a = document.activeElement; const p = a.closest && a.closest('.service-panel'); return p ? { href: a.getAttribute('href'), panel: [...document.querySelectorAll('.service-panel')].indexOf(p) } : null; });
      if (at && !reached.includes(at.href)) {
        reached.push(at.href);
        await t.page.waitForTimeout(1600); // the page moves to the step that shows this panel
        shown.push(await t.page.evaluate((i) => { const cs = getComputedStyle(document.querySelectorAll('.service-panel')[i]); return { opacity: +cs.opacity, events: cs.pointerEvents }; }, at.panel));
      }
    }
    const inTree = await t.page.evaluate(() => [...document.querySelectorAll('.service-panel')].every((p) => getComputedStyle(p).visibility !== 'hidden' && getComputedStyle(p).display !== 'none'));
    await report(`Services (${name}): all three service links are reachable by Tab, stay in the page, and each comes into view when focused`, t,
      reached.join() === '/services/web-design/,/services/marketing/,/services/workflow-automation/' && inTree && shown.every((x) => x.opacity > 0.9 && x.events === 'auto'), JSON.stringify({ reached, shown, inTree }));
    await t.ctx.close();
  }

  // ---- Site-wide scroll-and-reveal (D13) ----
  { // A below-fold section is held back until scrolled to, reveals fully, and leaves no inline styles behind.
    const t = await open('work/fluid-process-uk/');
    await t.page.waitForTimeout(900);
    const before = await t.page.evaluate(() => {
      const h2 = document.getElementById('design-title');
      return { op: +getComputedStyle(h2).opacity, below: h2.getBoundingClientRect().top > innerHeight };
    });
    await t.page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await t.page.waitForTimeout(1500);
    const after = await t.page.evaluate(() => {
      const h2 = document.getElementById('design-title');
      return { op: +getComputedStyle(h2).opacity, inline: h2.getAttribute('style') || '' };
    });
    // The case media drifts (parallax) as the page scrolls past it.
    const drift = await t.page.evaluate(async () => {
      const m = document.querySelector('.case .work-card__media');
      scrollTo(0, 0); await new Promise((r) => setTimeout(r, 450));
      const a = getComputedStyle(m).transform;
      scrollTo(0, 600); await new Promise((r) => setTimeout(r, 450));
      return a !== getComputedStyle(m).transform;
    });
    await report('Reveal (D13): a below-fold section waits, reveals in full with no inline styles left, and case media drifts',
      t, before.op === 0 && before.below && after.op === 1 && after.inline === '' && drift, JSON.stringify({ before, after, drift }));
    await t.ctx.close();
  }
  { // Reduced motion: nothing is hidden and nothing is held back, on a page with reveals.
    const t = await open('work/fluid-process-uk/', { reducedMotion: true });
    await t.page.waitForTimeout(700);
    const all = await t.page.evaluate(() => [...document.querySelectorAll('main section > *')].every((e) => +getComputedStyle(e).opacity === 1));
    await report('Reveal (D13): under reduced motion everything is visible at once', t, all, '');
    await t.ctx.close();
  }
  { // The Home scroll scenes stay out of reveal's hands: their children carry no reveal inline styles.
    const t = await open('?tier=low');
    await t.page.waitForTimeout(1100);
    const clean = await t.page.evaluate(() =>
      ['#scene-hero', '#scene-services', '#scene-work', '#scene-graph'].every((q) => {
        const s = document.querySelector(q);
        return !s || [...s.children].every((c) => !(c.getAttribute('style') || '').includes('translate'));
      }));
    await report('Reveal (D13): the Home scroll scenes and graph are untouched by it', t, clean, '');
    await t.ctx.close();
  }

  // ---- Contact, About, Privacy (Phase 6) ----
  { // The contact form: structure Netlify Forms needs, accessible labels, a honeypot nobody can reach, and the whole round trip.
    const t = await open('contact/');
    const r = await t.page.evaluate(() => {
      const f = document.querySelector('form[name="contact"]');
      const fields = [...f.querySelectorAll('input:not([type="hidden"]):not([name="bot-field"]), textarea')];
      const bot = f.querySelector('[name="bot-field"]');
      return {
        method: f.method, action: f.getAttribute('action'), netlify: f.hasAttribute('data-netlify'), honeypot: f.getAttribute('netlify-honeypot'),
        formName: f.querySelector('input[name="form-name"]')?.value,
        fields: fields.map((e) => ({ name: e.name, type: e.type || e.tagName.toLowerCase(), required: e.required, label: !!document.querySelector(`label[for="${e.id}"]`), autocomplete: e.autocomplete })),
        botHidden: !!bot.closest('[hidden]') && bot.getAttribute('tabindex') === '-1', botDisplayed: bot.getBoundingClientRect().width > 0,
        submit: !!f.querySelector('button[type="submit"]'), scripts: [...document.scripts].filter((x) => x.src && !x.src.startsWith(location.origin)).length,
        iframes: document.querySelectorAll('iframe').length, privacyLink: !!f.querySelector('a[href="/privacy/"]'),
      };
    });
    const names = r.fields.map((x) => x.name).join();
    await report('Contact form: Netlify Forms attributes, a labelled and required field each, a hidden honeypot, no third-party scripts or frames', t,
      r.method === 'post' && r.action === '/contact/thanks/' && r.netlify && r.honeypot === 'bot-field' && r.formName === 'contact' && names === 'name,email,message'
      && r.fields.every((x) => x.required && x.label) && r.fields[1].type === 'email' && r.fields[0].autocomplete === 'name' && r.fields[1].autocomplete === 'email'
      && r.botHidden && !r.botDisplayed && r.submit && r.scripts === 0 && r.iframes === 0 && r.privacyLink, JSON.stringify(r));

    // Keyboard: Tab order is name, email, message, Send, Privacy policy, and never the honeypot.
    await t.page.evaluate(() => document.getElementById('contact-name').focus());
    const order = [await t.page.evaluate(() => document.activeElement.name || document.activeElement.id)];
    for (let i = 0; i < 4; i++) { await t.page.keyboard.press('Tab'); order.push(await t.page.evaluate(() => document.activeElement.name || document.activeElement.textContent.trim() || document.activeElement.id)); }
    await report('Contact form: keyboard order is name, email, message, Send, Privacy policy (never the honeypot)', t, order.join() === 'name,email,message,Send,Privacy policy', order.join());

    // An empty submission is stopped by the browser and stays on the page.
    await t.page.click('button[type="submit"]');
    await t.page.waitForTimeout(500);
    const stay = await t.page.evaluate(() => ({ url: location.pathname, invalid: document.querySelector('#contact-name').matches(':invalid') }));
    await report('Contact form: an empty submission is blocked and stays on the page', t, stay.url === '/contact/' && stay.invalid, JSON.stringify(stay));

    // A filled one posts the right fields to our own thanks page. (Netlify itself processes it only once deployed.)
    let posted = null;
    t.page.on('request', (rq) => { if (rq.method() === 'POST') posted = { url: rq.url().replace(base, ''), body: rq.postData() }; });
    await t.page.fill('#contact-name', 'Test Person');
    await t.page.fill('#contact-email', 'test@example.com');
    await t.page.fill('#contact-message', 'A test message');
    await Promise.all([t.page.waitForURL('**/contact/thanks/'), t.page.click('button[type="submit"]')]);
    const params = new URLSearchParams(posted?.body || '');
    await report('Contact form: a filled form posts name, email and message with form-name and an empty honeypot to /contact/thanks/', t,
      posted && posted.url === '/contact/thanks/' && params.get('form-name') === 'contact' && params.get('name') === 'Test Person' && params.get('email') === 'test@example.com' && params.get('message') === 'A test message' && (params.get('bot-field') || '') === '', JSON.stringify(posted));
    await t.ctx.close();
  }

  { // The thanks page: not for search engines, not linked from anywhere, one h1.
    const t = await open('contact/thanks/');
    const r = await t.page.evaluate(() => ({ robots: document.querySelector('meta[name="robots"]')?.content, h1: document.querySelectorAll('h1').length, nav: document.querySelectorAll('[data-active], [aria-current="page"]').length }));
    const linked = [];
    for (const route of ['', 'contact/', 'about/', 'privacy/', 'work/']) { const html = await (await fetch(`${base}/${route}`)).text(); if (html.includes('href="/contact/thanks/')) linked.push(route || '/'); }
    await report('Thanks page: noindex, one h1, and not linked from any page', t, /^noindex/.test(r.robots) && r.h1 === 1 && linked.length === 0, JSON.stringify({ ...r, linked }));
    await t.ctx.close();
  }

  { // Privacy: the structure for the full UK GDPR text, each part a visible placeholder.
    const t = await open('privacy/');
    const r = await t.page.evaluate(() => { const h2 = [...document.querySelectorAll('main h2')]; return { headings: h2.map((h) => h.textContent), placeholders: h2.filter((h) => h.nextElementSibling && h.nextElementSibling.classList.contains('placeholder')).length, external: [...document.querySelectorAll('main a[href^="http"]')].length, h1: document.querySelectorAll('h1').length }; });
    await report('Privacy: nine structured sections, each with a visible placeholder, no external links', t, r.headings.length === 9 && r.placeholders === 9 && r.external === 0 && r.h1 === 1 && r.headings.includes('Cookies') && r.headings.includes('Your rights'), JSON.stringify(r));
    await t.ctx.close();
  }

  { // About: the photo slot is 4:5, beside the text on desktop and above it on a phone.
    for (const [label, viewport, side] of [['desktop', { width: 1440, height: 900 }, true], ['phone', { width: 375, height: 800 }, false]]) {
      const t = await open('about/', { viewport });
      const r = await t.page.evaluate(() => { const f = document.querySelector('.photo-slot__frame').getBoundingClientRect(); const x = document.querySelector('.about-grid__text').getBoundingClientRect(); return { ratio: +(f.width / f.height).toFixed(2), besideText: x.left >= f.right - 1 && Math.abs(x.top - f.top) < 40, overflow: document.documentElement.scrollWidth > innerWidth }; });
      await report(`About (${label}): a 4:5 photo slot ${side ? 'beside' : 'above'} the text`, t, Math.abs(r.ratio - 0.8) < 0.02 && r.besideText === side && !r.overflow, JSON.stringify(r));
      await t.ctx.close();
    }
  }

  // ---- Case studies (Phase 5): honest status, the rules about what may be shown, and the videos ----
  const CASES = [
    ['work/fluid-process-uk/', 'Fluid Process UK', 'live', 'Live', 3],
    ['work/aoe-engineering/', 'AOE Engineering', 'in-build', 'In build', 2],
    ['work/moss-and-memory/', 'Moss & Memory', 'concept', 'Concept', 1],
  ];
  for (const [route, name, status, label, placeholders] of CASES) {
    const t = await open(route);
    const r = await t.page.evaluate(() => ({
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent), badge: document.querySelector('.case-hero .badge')?.className + '|' + document.querySelector('.case-hero .badge')?.textContent,
      back: document.querySelector('.case-hero__back a')?.getAttribute('href'), cta: !!document.querySelector('.case-hero a.button[href="/contact/"]'),
      outbound: [...document.querySelectorAll('article a[href^="http"]')].map((a) => new URL(a.href).hostname),
      placeholders: document.querySelectorAll('.work-card__media--placeholder').length, eyebrow: document.querySelector('.case-hero .eyebrow')?.textContent,
    }));
    const outboundOk = status === 'live' ? r.outbound.join() === 'www.fluidprocess.co.uk' : r.outbound.length === 0;
    await report(`${route}: one h1, the ${label} badge, a back link, outbound link only if Live, visible placeholders`, t,
      r.h1.length === 1 && r.h1[0] === name && r.badge === `badge badge--${status}|${label}` && r.back === '/work/' && r.cta && outboundOk && r.placeholders >= placeholders && r.eyebrow === 'Case study', JSON.stringify(r));
    await t.ctx.close();
  }

  { // Moss & Memory: only the three permitted parts of the concept site, by Nathan's instruction. Never its Gallery.
    const t = await open('work/moss-and-memory/');
    const files = await t.page.evaluate(() => {
      const urls = new Set();
      document.querySelectorAll('[src],[srcset],[poster],[data-mp4],[data-webm]').forEach((e) => ['src', 'srcset', 'poster', 'data-mp4', 'data-webm'].forEach((a) => { const v = e.getAttribute(a); if (v) v.split(',').forEach((x) => { const u = x.trim().split(' ')[0]; if (u.includes('/work/')) urls.add(u.split('/').pop()); }); }));
      return { urls: [...urls].sort(), text: document.querySelector('article').innerText };
    });
    const allowed = new Set(['build-sequence.mp4', 'build-sequence.webm', 'poster-hero.jpg', 'poster-hero.avif', 'poster-plants.jpg', 'poster-plants.avif', 'poster-light.jpg', 'poster-light.avif']);
    const stray = files.urls.filter((u) => !allowed.has(u));
    await report('Moss & Memory: only the permitted media (hero, build sequence, three posters) and no mention of its Gallery', t, stray.length === 0 && files.urls.length >= 6 && !/gallery|worlds we/i.test(files.text), JSON.stringify({ stray, urls: files.urls }));
    await t.ctx.close();
  }

  for (const [name, opts, expect] of [['in-view playback', {}, 'view'], ['reduced motion: play on tap', { reducedMotion: true }, 'tap']]) {
    const t = await open('work/moss-and-memory/', opts);
    await t.page.waitForTimeout(800);
    await t.page.evaluate(() => document.querySelector('.case-visual').scrollIntoView({ block: 'center' }));
    await t.page.waitForTimeout(1500);
    const before = await t.page.evaluate(() => ({ mode: document.documentElement.dataset.videos, playing: !document.querySelector('.case-visual video').paused && !!document.querySelector('.case-visual video').getAttribute('src') }));
    let after = before;
    if (expect === 'tap') { await t.page.click('.case-visual .work-card__play'); await t.page.waitForTimeout(1500); after = await t.page.evaluate(() => ({ mode: document.documentElement.dataset.videos, playing: !document.querySelector('.case-visual video').paused, url: location.pathname })); }
    await report(`Moss & Memory: the recording uses ${name}`, t, before.mode === expect && (expect === 'view' ? before.playing : !before.playing && after.playing && after.url === '/work/moss-and-memory/'), JSON.stringify({ before, after }));
    await t.ctx.close();
  }

  { // WCAG 1.4.13: a header sub-menu opened by keyboard focus can be dismissed with Escape, without leaving a focus ring on a hidden control.
    const t = await open('about/');
    const menuWidth = (sel) => t.page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().width, sel);
    await t.page.focus('.site-nav__item:first-child .site-nav__sub a');          // Services has no link of its own
    const open1 = await menuWidth('.site-nav__item:first-child .site-nav__sub');
    await t.page.keyboard.press('Escape');
    const closed1 = await menuWidth('.site-nav__item:first-child .site-nav__sub');
    const focus1 = await t.page.evaluate(() => document.activeElement.tagName);
    await t.page.focus('.site-nav__item:nth-child(2) .site-nav__sub a');         // Work has its own link: focus returns to it
    const open2 = await menuWidth('.site-nav__item:nth-child(2) .site-nav__sub');
    await t.page.keyboard.press('Escape');
    const closed2 = await menuWidth('.site-nav__item:nth-child(2) .site-nav__sub');
    const focus2 = await t.page.evaluate(() => document.activeElement.getAttribute('href'));
    await t.page.evaluate(() => document.activeElement.blur());                   // focus leaves the item entirely, which re-arms its menu
    await t.page.focus('.site-nav__item:nth-child(2) .site-nav__sub a');
    const reopened = await menuWidth('.site-nav__item:nth-child(2) .site-nav__sub');
    await report('Header sub-menus: Escape dismisses an open menu, focus never rests on a hidden link, and the menu opens again later', t,
      open1 > 50 && closed1 <= 2 && focus1 === 'BODY' && open2 > 50 && closed2 <= 2 && focus2 === '/work/' && reopened > 50, JSON.stringify({ open1, closed1, focus1, open2, closed2, focus2, reopened }));
    await t.ctx.close();
  }

  { // Phones: a Menu button opens a panel that shows every page, closes with Escape, and is open in full without JavaScript.
    const probe = () => ({
      toggle: (() => { const b = document.querySelector('.site-nav__toggle'); return { shown: getComputedStyle(b).display !== 'none', expanded: b.getAttribute('aria-expanded') }; })(),
      header: document.querySelector('.site-header').offsetHeight,
      links: [...document.querySelectorAll('.site-nav a')].map((a) => { const r = a.getBoundingClientRect(); return { w: r.width, h: r.height, right: r.right }; }),
      overflow: document.documentElement.scrollWidth > innerWidth,
    });
    const phone = { width: 375, height: 812 };
    const t = await open('about/', { viewport: phone });
    const closed = await t.page.evaluate(probe);
    await t.page.click('.site-nav__toggle');
    const opened = await t.page.evaluate(probe);
    await t.page.focus('.site-nav a[href="/services/marketing/"]');              // focus is inside the panel when Escape is pressed
    await t.page.keyboard.press('Escape');
    const after = await t.page.evaluate(() => ({ expanded: document.querySelector('.site-nav__toggle').getAttribute('aria-expanded'), focus: document.activeElement.className }));
    await t.page.click('.site-nav__toggle');
    await t.page.setViewportSize({ width: 1000, height: 800 });
    await t.page.waitForFunction(() => !document.querySelector('.site-header').hasAttribute('data-menu-open'), null, { timeout: 2000 }).catch(() => {}); // the media-query change event is asynchronous
    const wide = await t.page.evaluate(() => ({ toggle: getComputedStyle(document.querySelector('.site-nav__toggle')).display, open: document.querySelector('.site-header').hasAttribute('data-menu-open') }));
    await report('Phone menu: closed it is one slim row, open it lists all 9 links at touch size, Escape closes it back to the button, and widening the window resets it', t,
      closed.toggle.shown && closed.toggle.expanded === 'false' && closed.header < 100 && closed.links.every((l) => l.w === 0) && !closed.overflow
      && opened.toggle.expanded === 'true' && opened.links.length === 9 && opened.links.every((l) => l.w > 40 && l.h >= 40 && l.right <= phone.width) && !opened.overflow
      && after.expanded === 'false' && /site-nav__toggle/.test(after.focus) && wide.toggle === 'none' && !wide.open,
      JSON.stringify({ closed, opened: { ...opened, links: opened.links.length }, after, wide }));
    await t.ctx.close();

    const n = await open('about/', { viewport: phone, js: false });
    const plain = await n.page.evaluate(probe);
    await report('Phone menu without JavaScript: no button, and every link is on the page', n,
      !plain.toggle.shown && plain.links.length === 9 && plain.links.every((l) => l.w > 40 && l.h >= 24 && l.right <= phone.width) && !plain.overflow, JSON.stringify({ ...plain, links: plain.links.length }));
    await n.ctx.close();
  }

  // WCAG 2.2.2: a recording that starts by itself can be paused, and a pause sticks.
  const videoState = (page, sel) => page.evaluate((sel) => { const v = document.querySelector(sel + ' video'); const b = document.querySelector(sel + ' .work-card__play'); return { paused: v.paused, flagged: v.hasAttribute('data-user-paused'), label: b.textContent, name: b.getAttribute('aria-label') }; }, sel);
  { // List layout (in-view playback)
    const t = await open('work/moss-and-memory/');
    await t.page.waitForTimeout(600);
    await t.page.evaluate(() => document.querySelector('.case-visual').scrollIntoView({ block: 'center' }));
    await t.page.waitForTimeout(1500);
    const playing = await videoState(t.page, '.case-visual');
    await t.page.click('.case-visual .work-card__play');
    await t.page.waitForTimeout(500);
    const paused = await videoState(t.page, '.case-visual');
    await t.page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await t.page.waitForTimeout(1200);
    await t.page.evaluate(() => document.querySelector('.case-visual').scrollIntoView({ block: 'center' })); await t.page.waitForTimeout(1800);
    const stillPaused = await videoState(t.page, '.case-visual');
    await t.page.click('.case-visual .work-card__play'); await t.page.waitForTimeout(1200);
    const resumed = await videoState(t.page, '.case-visual');
    await report('Recordings (list): a Play/Pause button says what it will do, pausing sticks when scrolling away and back, and Play resumes', t,
      !playing.paused && playing.label === 'Pause' && /^Pause the Moss & Memory recording/.test(playing.name) && paused.paused && paused.label === 'Play' && paused.flagged && stillPaused.paused && !resumed.paused && !resumed.flagged && resumed.label === 'Pause',
      JSON.stringify({ playing, paused, stillPaused, resumed }));
    await t.ctx.close();
  }
  { // 3D gallery
    const t = await open('?tier=mid');
    await started(t.page);
    await toGallery(t.page, 1);
    const sel = '.work-card[data-project="moss-and-memory"]';
    const before = await videoState(t.page, sel);
    await t.page.click(`${sel} .work-card__play`);
    await t.page.waitForTimeout(2200); // long enough for the gallery's own play/pause management to run several times
    const paused = await videoState(t.page, sel);
    await t.page.click(`${sel} .work-card__play`); await t.page.waitForTimeout(1500);
    const resumed = await videoState(t.page, sel);
    await report('Recordings (3D gallery): the same button pauses the recording in its frame, the gallery does not restart it, and Play resumes', t,
      !before.paused && paused.paused && paused.flagged && paused.label === 'Play' && !resumed.paused && !resumed.flagged, JSON.stringify({ before, paused, resumed }));
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
// SEO: builds the site both ways (pre-launch and launch mode) and checks robots, sitemap, canonical and Open Graph.
{
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', [join(here, 'seo.mjs')], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  if (r.status !== 0) fail('SEO check failed (see above)');
}

if (failures.length) { console.log(`\nSMOKE FAILED: ${failures.length} problem(s)`); process.exit(1); }
console.log('\nSMOKE PASSED');
