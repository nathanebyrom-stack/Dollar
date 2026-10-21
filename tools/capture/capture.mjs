// Records a project's live site as the scroll-through videos the Work gallery plays (ARCHITECTURE section 8). Dev-only.
//   cd tools && npm install && node capture/capture.mjs fluid-process-uk
//   node capture/capture.mjs fluid-process-uk --viewports desktop       just one size
//   node capture/capture.mjs test --url http://127.0.0.1:8080/ --out /some/folder --no-manifest   try it on any URL
// For each viewport (projects.json): opens the page in Chromium with video recording, holds 1 s, scrolls smoothly from
// top to bottom over scrollSeconds, holds 1 s. ffmpeg then trims to that, encodes MP4 (H.264, faststart) and WebM
// (VP9) at 30 fps with no audio, each at or under 2.5 MB (it raises the CRF until the file fits), and a JPG and AVIF
// poster from the first meaningful frame. Output goes to src/assets/work/<project>/ with an ASSETS.md note, and the
// project's media entry in src/assets/work/projects.json is updated so the gallery picks the clips up.
//
// It never clicks anything on the site. If a cookie or consent banner is showing it stops and says so: dismissing one
// on the site owner's behalf is not its call. Needs ffmpeg on the PATH (brew install ffmpeg). Never fakes a recording.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, statSync, appendFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const require = createRequire(join(here, '..', 'package.json'));
const { chromium } = require('playwright-core');
const sharp = require('sharp');

const MAX_BYTES = 2_500_000;
const HOLD_MS = 1000;
const CRF = { mp4: 26, webm: 36 };

// ---- Arguments ----
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i === -1 ? null : argv[i + 1]; };
const has = (name) => argv.includes(`--${name}`);
const id = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);
const config = JSON.parse(readFileSync(join(here, 'projects.json'), 'utf8'));
const project = { ...(config.projects[id] || {}) };
if (!id) { console.error('Usage: node capture/capture.mjs <project> [--viewports desktop,phone] [--url URL] [--out DIR] [--no-manifest]'); process.exit(1); }
if (flag('url')) project.url = flag('url');
if (!project.url) { console.error(`Unknown project "${id}" (known: ${Object.keys(config.projects).join(', ')}). Pass --url to try another site.`); process.exit(1); }
const viewports = (flag('viewports') ? flag('viewports').split(',') : project.viewports || ['desktop', 'phone']);
const outDir = flag('out') ? resolve(flag('out')) : join(root, 'src', 'assets', 'work', id);
const scrollSeconds = project.scrollSeconds || 10;
const maxScreens = project.maxScreens || 6;

if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.error('ffmpeg not found on the PATH. Install it (brew install ffmpeg) and run again.'); process.exit(1); }

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', file], { encoding: 'utf8' });
  const s = JSON.parse(r.stdout).streams[0];
  return { width: s.width, height: s.height, duration: parseFloat(s.duration) };
}

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

// Encode with the CRF raised until the file fits the size cap. Returns { file, bytes, crf }.
function encode(kind, input, trim, scaleWidth, out) {
  const codec = kind === 'mp4'
    ? (crf) => ['-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
    : (crf) => ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p'];
  for (let crf = CRF[kind]; crf <= CRF[kind] + 14; crf += 2) {
    ffmpeg(['-ss', trim.start.toFixed(3), '-t', trim.duration.toFixed(3), '-i', input, '-vf', `scale=${scaleWidth}:-2:flags=lanczos,fps=30`, ...codec(crf), '-an', out]);
    const bytes = statSync(out).size;
    if (bytes <= MAX_BYTES) return { file: out, bytes, crf };
  }
  throw new Error(`${out}: could not get under ${MAX_BYTES} bytes even at the highest CRF tried; shorten scrollSeconds or maxScreens`);
}

// Is a cookie or consent banner showing? (We never dismiss one.)
const bannerCheck = () => [...document.querySelectorAll('[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id*="gdpr" i],[class*="gdpr" i],[aria-label*="cookie" i]')]
  .filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 200 && r.height > 40 && cs.display !== 'none' && cs.visibility !== 'hidden' && (cs.position === 'fixed' || cs.position === 'sticky' || r.bottom > innerHeight * 0.6); })
  .map((e) => e.id || String(e.className).slice(0, 60)).slice(0, 3);

// A smooth, steady scroll from the top to `max` px over `seconds`.
const smoothScroll = ({ seconds, maxScreens }) => new Promise((resolveScroll) => {
  document.documentElement.style.scrollBehavior = 'auto';
  const max = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, innerHeight * maxScreens));
  const ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  const start = performance.now();
  (function step(now) {
    const t = Math.min(1, (now - start) / (seconds * 1000));
    scrollTo(0, max * ease(t));
    if (t < 1) requestAnimationFrame(step); else resolveScroll(max);
  })(start);
});

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: findChromium() });
const results = {};

try {
  for (const name of viewports) {
    const vp = config.viewports[name];
    if (!vp) throw new Error(`Unknown viewport "${name}"`);
    const tmp = mkdtempSync(join(tmpdir(), '34-capture-'));
    const phone = name === 'phone';
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: phone, hasTouch: phone,
      recordVideo: { dir: tmp, size: { width: vp.width, height: vp.height } },
    });
    const opened = Date.now();
    const page = await context.newPage();
    await page.goto(project.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);

    const banners = await page.evaluate(bannerCheck);
    if (banners.length) {
      await context.close();
      console.error(`\nStopped: a cookie or consent banner looks to be showing on ${project.url} (${banners.join(', ')}).\nThis tool never clicks through one on the site owner's behalf. Decide with Nathan how to handle it (ask the site owner for a banner-free capture, or record by hand) and run again.`);
      process.exitCode = 2;
      break;
    }

    const holdStart = Date.now();
    await page.waitForTimeout(HOLD_MS);
    const distance = await page.evaluate(smoothScroll, { seconds: scrollSeconds, maxScreens });
    await page.waitForTimeout(HOLD_MS);
    const holdEnd = Date.now();
    const video = page.video();
    await context.close(); // flushes the recording
    const raw = await video.path();

    // The recording starts when the page opens: trim to a little before the first hold and a little after the last.
    const start = Math.max(0, (holdStart - opened) / 1000 - 0.3);
    const duration = (holdEnd - holdStart) / 1000 + 0.6;
    const base = join(outDir, name);
    const mp4 = encode('mp4', raw, { start, duration }, vp.encodeWidth, `${base}.mp4`);
    const webm = encode('webm', raw, { start, duration }, vp.encodeWidth, `${base}.webm`);
    const { width, height } = probe(mp4.file);

    // Poster: the first meaningful frame, once the opening hold has settled.
    const png = join(tmp, 'poster.png');
    ffmpeg(['-ss', '0.9', '-i', mp4.file, '-frames:v', '1', png]);
    const posterJpg = `${outDir}/poster-${name}.jpg`;
    await sharp(png).jpeg({ quality: 80, mozjpeg: true }).toFile(posterJpg);
    await sharp(png).avif({ quality: 50, effort: 6 }).toFile(`${outDir}/poster-${name}.avif`);

    results[name] = { width, height, mp4, webm, scrolled: Math.round(distance), seconds: scrollSeconds };
    console.log(`${name.padEnd(8)} ${width}x${height}  mp4 ${(mp4.bytes / 1024).toFixed(0)} KB (crf ${mp4.crf})  webm ${(webm.bytes / 1024).toFixed(0)} KB (crf ${webm.crf})  scrolled ${Math.round(distance)} px over ${scrollSeconds} s`);
    rmSync(tmp, { recursive: true, force: true });
  }
} finally {
  await browser.close();
}

if (!Object.keys(results).length) process.exit(process.exitCode || 1);

// ---- Record it ----
const today = new Date().toISOString().slice(0, 10);
const notes = Object.entries(results).map(([name, r]) => `| ${name}.mp4 / ${name}.webm | ${r.width} x ${r.height}, ${scrollSeconds} s smooth scroll of ${project.url} (${r.scrolled} px), 30 fps, no audio; poster-${name}.jpg / .avif |`).join('\n');
const assets = join(outDir, 'ASSETS.md');
if (!existsSync(assets)) writeFileSync(assets, `# ${id} assets\n\nRecorded by tools/capture/capture.mjs. Re-run it when the site changes; never replace these with a mock-up.\n\n| File | What it is |\n|---|---|\n`);
appendFileSync(assets, `${notes}\n\n_Captured ${today}._\n`);

if (!has('no-manifest')) {
  const manifestPath = join(root, 'src', 'assets', 'work', 'projects.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entry = manifest.projects.find((p) => p.id === id);
  if (!entry) console.warn(`\n${id} is not in src/assets/work/projects.json, so the manifest was not updated. Add the project there first.`);
  else {
    entry.media = entry.media || {};
    for (const [name, r] of Object.entries(results)) entry.media[name] = { dir: `/assets/work/${id}/`, mp4: `${name}.mp4`, webm: `${name}.webm`, poster: `poster-${name}.jpg`, width: r.width, height: r.height };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`\nUpdated ${id} media in src/assets/work/projects.json. Rebuild and check it, then commit the clips.`);
  }
}
