// WCAG 2.1 AA contrast check, read straight from src/assets/css/tokens.css (so it cannot drift from the site).
//   node tools/check/contrast.mjs
// Text pairs need 4.5:1; non-text pairs (focus ring, control borders) need 3:1. Exits 1 on any failure.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'assets', 'css', 'tokens.css'), 'utf8');
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)[1];
const raw = {};
for (const m of rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) raw[m[1]] = m[2].trim();

function resolve(name, seen = new Set()) {
  let v = raw[name];
  if (v === undefined || seen.has(name)) throw new Error(`Unresolved token ${name}`);
  seen.add(name);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? resolve(ref[1], seen) : v;
}

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const [r, g, b] = rgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const surfaces = ['--color-bg', '--color-bg-deep', '--color-surface', '--color-surface-2'];
const text = ['--color-text', '--color-text-strong', '--color-text-muted', '--color-placeholder', '--color-error'];
const nonText = ['--color-focus'];

let bad = 0;
const row = (fg, bg, min) => {
  const r = ratio(resolve(fg), resolve(bg));
  const ok = r >= min;
  if (!ok) bad++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (need ${min})  ${fg} ${resolve(fg)}  on  ${bg} ${resolve(bg)}`);
};
console.log('Text, AA 4.5:1');
for (const bg of surfaces) for (const fg of text) row(fg, bg, 4.5);
console.log('\nNon-text, 3:1');
for (const bg of surfaces) for (const fg of nonText) row(fg, bg, 3);
// Skip link and filled controls invert text and ground.
console.log('\nInverted (skip link: bg colour on text colour)');
row('--color-bg', '--color-text', 4.5);
if (bad) { console.log(`\n${bad} pair(s) below AA`); process.exit(1); }
console.log('\nAll pairs pass AA');
