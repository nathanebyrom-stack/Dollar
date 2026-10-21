// Vendors ScrollTrigger, Lenis and Three.js into src/assets/vendor/ (ARCHITECTURE §4). Dev-only.
//   cd tools && npm install && node vendor/vendor.mjs
// Downloads each package from npm into a fresh temp folder, copies or minifies the files we use, and
// rewrites Three.js imports to relative paths so no inline import map is needed (CSP: script-src 'self').
// Nothing from the downloaded packages is ever executed. See src/assets/vendor/README.md for the output.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, dirname, relative, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', '..', 'src', 'assets', 'vendor');
const { transform } = createRequire(join(here, '..', 'package.json'))('esbuild');

const VERSIONS = { gsap: '3.13.0', three: '0.186.1', lenis: '1.3.27' };
const THREE_DIR = 'three-r186';

// Three.js files the scene uses (ARCHITECTURE §4). Their own imports are followed automatically.
const ADDON_ENTRIES = [
  'geometries/RoundedBoxGeometry.js',
  'environments/RoomEnvironment.js',
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/OutputPass.js',
];

const tmp = mkdtempSync(join(process.env.VENDOR_TMP || tmpdir(), '34-vendor-'));
const log = [];

function fetchPackage(name, version) {
  const dir = join(tmp, name);
  mkdirSync(dir);
  execFileSync('npm', ['pack', `${name}@${version}`, '--silent', '--ignore-scripts'], { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] });
  const tgz = execFileSync('ls', [dir]).toString().split('\n').find((f) => f.endsWith('.tgz'));
  execFileSync('tar', ['xzf', tgz], { cwd: dir });
  return join(dir, 'package');
}

function record(file, note) {
  const buf = readFileSync(join(out, file));
  log.push({ file, bytes: buf.length, gzip: gzipSync(buf).length, sha256: createHash('sha256').update(buf).digest('hex').slice(0, 16), note });
}

// We do not ship .map files, so drop the trailing sourceMappingURL comment (it would 404 whenever DevTools is open).
function copyStripped(from, to) {
  writeFileSync(to, readFileSync(from, 'utf8').replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n'));
}

mkdirSync(out, { recursive: true });

// ---- GSAP: ScrollTrigger at the same version as the GSAP already vendored ----
const gsap = fetchPackage('gsap', VERSIONS.gsap);
const sameGsap = createHash('sha256').update(readFileSync(join(gsap, 'dist', 'gsap.min.js'))).digest('hex') ===
  createHash('sha256').update(readFileSync(join(out, `gsap-${VERSIONS.gsap}.min.js`))).digest('hex');
if (!sameGsap) throw new Error('The vendored gsap-3.13.0.min.js does not match the npm package; refusing to pair it with ScrollTrigger');
copyStripped(join(gsap, 'dist', 'ScrollTrigger.min.js'), join(out, `ScrollTrigger-${VERSIONS.gsap}.min.js`));
record(`ScrollTrigger-${VERSIONS.gsap}.min.js`, 'unmodified except the sourceMappingURL comment');
record(`gsap-${VERSIONS.gsap}.min.js`, 'already vendored; verified identical to the npm package');

// ---- Lenis: the UMD/IIFE build, which sets window.Lenis ----
const lenis = fetchPackage('lenis', VERSIONS.lenis);
copyStripped(join(lenis, 'dist', 'lenis.min.js'), join(out, `lenis-${VERSIONS.lenis}.min.js`));
copyFileSync(join(lenis, 'LICENSE'), join(out, 'LICENSE-lenis-MIT.txt'));
record(`lenis-${VERSIONS.lenis}.min.js`, 'unmodified except the sourceMappingURL comment');

// ---- Three.js: minify (r186 ships no .min.js) and rewrite imports ----
const three = fetchPackage('three', VERSIONS.three);
const threeOut = join(out, THREE_DIR);
rmSync(threeOut, { recursive: true, force: true });
mkdirSync(threeOut, { recursive: true });
copyFileSync(join(three, 'LICENSE'), join(threeOut, 'LICENSE.txt'));

const minify = (code) => transform(code, { minify: true, format: 'esm', target: 'es2022', legalComments: 'inline' });
const IMPORT_SPEC = /(\b(?:from|import)\s*)(['"])([^'"]+)\2/g;

async function emit(srcFile, destRel, mapSpec, noteName) {
  const dest = join(threeOut, destRel);
  mkdirSync(dirname(dest), { recursive: true });
  // Minify first: that strips comments (some contain example imports), so only real specifiers remain.
  const { code: minified } = await minify(readFileSync(srcFile, 'utf8'));
  const code = minified.replace(IMPORT_SPEC, (m, kw, q, spec) => `${kw}${q}${mapSpec(spec, dest)}${q}`);
  // No bare specifiers may survive: a bare 'three' would need an import map, which the CSP forbids.
  for (const m of code.matchAll(/(?:from|import)\s*["']([^"'.\/][^"']*)["']/g)) throw new Error(`Bare specifier "${m[1]}" left in ${destRel}`);
  writeFileSync(dest, code);
  record(`${THREE_DIR}/${destRel}`, noteName);
}

// Core: three.module.js imports ./three.core.js; point it at the .min.js names.
await emit(join(three, 'build', 'three.core.js'), 'three.core.min.js', (s) => s, 'minified, otherwise unmodified');
await emit(join(three, 'build', 'three.module.js'), 'three.module.min.js', (s) => (s === './three.core.js' ? './three.core.min.js' : s), 'minified; import of ./three.core.js renamed to ./three.core.min.js');

// Addons: follow relative imports from the entries, rewriting bare 'three' to a relative path.
const seen = new Set();
async function addon(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const srcFile = join(three, 'examples', 'jsm', rel);
  if (!existsSync(srcFile)) throw new Error(`Missing addon ${rel}`);
  const deps = [];
  await emit(srcFile, join('addons', rel), (spec, dest) => {
    if (spec === 'three') return posix.relative(dirname(relative(threeOut, dest)).split('\\').join('/'), 'three.module.min.js');
    if (spec.startsWith('.')) { deps.push(posix.normalize(posix.join(posix.dirname(rel), spec))); return spec; }
    throw new Error(`${rel} imports "${spec}", which is not relative or 'three'`);
  }, "minified; bare 'three' import rewritten to a relative path");
  for (const d of deps) await addon(d);
}
for (const e of ADDON_ENTRIES) await addon(e);

rmSync(tmp, { recursive: true, force: true });

const kb = (n) => (n / 1024).toFixed(1).padStart(7);
console.log('file'.padEnd(66), '    raw KB', '  gzip KB', '  sha256[:16]');
for (const l of log) console.log(l.file.padEnd(66), kb(l.bytes), kb(l.gzip), ' ', l.sha256);
const t = log.filter((l) => l.file.startsWith(THREE_DIR));
console.log(`\nThree.js total: ${kb(t.reduce((a, l) => a + l.bytes, 0))} KB raw, ${kb(t.reduce((a, l) => a + l.gzip, 0))} KB gzip across ${t.length} files`);
