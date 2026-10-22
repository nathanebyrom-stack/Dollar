// SEO structure check (ARCHITECTURE section 14, Phase 8). Builds the site twice into temporary folders and checks both:
//   node tools/check/seo.mjs
//  - pre-launch (the real setting while "indexable" is false): every page says noindex, robots.txt disallows everything,
//    and the sitemap still lists the indexable routes.
//  - launch mode (SITE_INDEXABLE=1): robots.txt allows crawling and points at the sitemap; the sitemap lists exactly the pages
//    that are not noindex and not the 404; only the deliberately-noindex pages keep noindex; every indexable page has a
//    canonical, a description, Open Graph and Twitter tags, and the Open Graph image exists at 1200 x 630.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const sharp = createRequire(join(here, '..', 'package.json'))('sharp');
const { site, pages } = JSON.parse(readFileSync(join(root, 'src', 'pages.json'), 'utf8'));

const failures = [];
const check = (name, ok, detail = '') => { if (ok) console.log(`  ok   seo: ${name}`); else { failures.push(name); console.log(`  FAIL seo: ${name}${detail ? `\n       ${detail}` : ''}`); } };

function build(env) {
  const out = mkdtempSync(join(tmpdir(), '34-seo-'));
  execFileSync('node', [join(root, 'scripts', 'build.mjs')], { env: { ...process.env, ...env, OUT_DIR: out }, stdio: 'ignore' });
  return out;
}
const fileFor = (out, route) => join(out, route.endsWith('.html') ? route : join(route, 'index.html'));
const meta = (html, re) => (re.exec(html) || [])[1];
const urls = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const expectedUrls = pages.filter((p) => !p.noindex && p.route !== '/404.html').map((p) => site.url + p.route).sort();

// ---- Pre-launch: how the site is built today ----
const pre = build({ SITE_INDEXABLE: site.indexable ? '1' : '' });
if (!site.indexable) {
  const robots = readFileSync(join(pre, 'robots.txt'), 'utf8');
  check('pre-launch: robots.txt disallows everything and names no sitemap', /Disallow: \/\s*$/m.test(robots) && !/Sitemap:/i.test(robots), robots);
  const missing = pages.filter((p) => !/<meta name="robots" content="noindex/.test(readFileSync(fileFor(pre, p.route), 'utf8'))).map((p) => p.route);
  check('pre-launch: every page says noindex, so placeholder copy cannot be indexed', missing.length === 0, missing.join(', '));
  check('pre-launch: the sitemap still lists the indexable pages', JSON.stringify(urls(readFileSync(join(pre, 'sitemap.xml'), 'utf8')).sort()) === JSON.stringify(expectedUrls));
} else console.log('  (site is already indexable: skipping the pre-launch checks)');
rmSync(pre, { recursive: true, force: true });

// ---- Launch mode ----
const live = build({ SITE_INDEXABLE: '1' });
const robots = readFileSync(join(live, 'robots.txt'), 'utf8');
check('launch: robots.txt allows crawling and points at the sitemap', /Allow: \//.test(robots) && !/Disallow: \/\s*$/m.test(robots) && robots.includes(`Sitemap: ${site.url}/sitemap.xml`), robots);
const listed = urls(readFileSync(join(live, 'sitemap.xml'), 'utf8'));
check('launch: the sitemap lists exactly the indexable pages (no 404, no noindex page), once each', JSON.stringify([...listed].sort()) === JSON.stringify(expectedUrls) && new Set(listed).size === listed.length, `listed ${listed.length}, expected ${expectedUrls.length}`);
check('launch: every sitemap URL is absolute, https and ends in a slash', listed.every((u) => u.startsWith('https://') && u.endsWith('/')));

const problems = [];
for (const p of pages) {
  const html = readFileSync(fileFor(live, p.route), 'utf8');
  const noindex = /<meta name="robots" content="noindex/.test(html);
  if (noindex !== !!p.noindex) problems.push(`${p.route}: noindex is ${noindex}, expected ${!!p.noindex}`);
  if (p.noindex) continue;
  const canonical = meta(html, /<link rel="canonical" href="([^"]+)"/);
  if (canonical !== site.url + p.route) problems.push(`${p.route}: canonical ${canonical}`);
  if (!meta(html, /<meta name="description" content="([^"]+)"/)) problems.push(`${p.route}: no description`);
  if (meta(html, /<meta property="og:url" content="([^"]+)"/) !== canonical) problems.push(`${p.route}: og:url differs from the canonical`);
  for (const k of ['og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'og:type', 'og:site_name']) if (!meta(html, new RegExp(`<meta property="${k}" content="([^"]+)"`))) problems.push(`${p.route}: missing ${k}`);
  if (meta(html, /<meta name="twitter:card" content="([^"]+)"/) !== 'summary_large_image') problems.push(`${p.route}: twitter:card`);
  if (!/<title>[^<]+<\/title>/.test(html)) problems.push(`${p.route}: no <title>`);
}
const dup = (re) => {
  const seen = new Map();
  for (const p of pages.filter((x) => !x.noindex)) { const v = meta(readFileSync(fileFor(live, p.route), 'utf8'), re); seen.set(v, [...(seen.get(v) || []), p.route]); }
  return [...seen].filter(([, routes]) => routes.length > 1).map(([v, routes]) => `${routes.join(' + ')} share "${v}"`);
};
const dupes = [...dup(/<title>([^<]+)<\/title>/), ...dup(/<meta name="description" content="([^"]+)"/)];
check('launch: every indexable page has its own title and description', dupes.length === 0, dupes.join('; '));

check('launch: indexable pages have a canonical, description, title, Open Graph and Twitter tags; only the deliberate noindex pages keep noindex', problems.length === 0, problems.join('; '));

const ogPath = join(root, 'src', site.ogImage);
let og = null;
if (existsSync(ogPath)) { const m = await sharp(ogPath).metadata(); og = { w: m.width, h: m.height, kb: Math.round(readFileSync(ogPath).length / 1024) }; }
check('the Open Graph image exists at 1200 x 630 and is under 300 KB', og && og.w === 1200 && og.h === 630 && og.kb < 300, JSON.stringify(og));
check('the Open Graph image is in the built site at the URL the tags give', existsSync(join(live, site.ogImage)));
rmSync(live, { recursive: true, force: true });

if (failures.length) { console.log(`\nSEO CHECK FAILED: ${failures.length} problem(s)`); process.exit(1); }
console.log('  SEO CHECK PASSED');
