/* Die engravings: draws each face's symbol into a height field, then derives a normal map (the recess)
   and an emissive map (the Spark glow). Symbols are the approved D2 line icons in /assets/brand/symbols/
   and the "34" mark from the logo plate; nothing here is a bitmap asset.

   Every texture is authored upright. die.js maps each face's UVs so that the symbol reads upright at the
   moment the face arrives at the front (ARCHITECTURE section 5), so no per-face rotation is needed here.

   Everything is deterministic (seeded noise, no Math.random) so the pre-rendered stills match the live die. */
import * as THREE from '../../vendor/three-r186/three.module.min.js';

// Face name -> source image and the share of the face width the glyph fills.
const GLYPHS = {
  front:  { src: '/assets/brand/mark-34.svg', fill: 0.58 },
  top:    { src: '/assets/brand/symbols/web-design.svg', fill: 0.56 },
  back:   { src: '/assets/brand/symbols/marketing.svg', fill: 0.56 },
  bottom: { src: '/assets/brand/symbols/workflow-automation.svg', fill: 0.56 },
};

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return c;
}

async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

// The glyph's alpha, centred and scaled to `fill` of the canvas width.
function glyphMask(img, n, fill) {
  const c = canvas(n);
  const g = c.getContext('2d');
  const ratio = img.naturalWidth / img.naturalHeight;
  let w = n * fill;
  let h = w / ratio;
  if (h > n * fill) { h = n * fill; w = h * ratio; }
  g.drawImage(img, (n - w) / 2, (n - h) / 2, w, h);
  return c;
}

// Flat colours: `fg` where the glyph is, `bg` elsewhere.
function paint(mask, n, fg, bg) {
  const c = canvas(n);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, n, n);
  const t = canvas(n);
  const tg = t.getContext('2d');
  tg.drawImage(mask, 0, 0);
  tg.globalCompositeOperation = 'source-in';
  tg.fillStyle = fg;
  tg.fillRect(0, 0, n, n);
  g.drawImage(t, 0, 0);
  return c;
}

// Separable box blur, done by hand because canvas filters are not available everywhere.
function blur(src, n, radius, passes) {
  let a = src;
  let b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < n; y++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += a[y * n + Math.min(n - 1, Math.max(0, x))];
      for (let x = 0; x < n; x++) {
        b[y * n + x] = sum / (2 * radius + 1);
        sum += a[y * n + Math.min(n - 1, x + radius + 1)] - a[y * n + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < n; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += b[Math.min(n - 1, Math.max(0, y)) * n + x];
      for (let y = 0; y < n; y++) {
        a[y * n + x] = sum / (2 * radius + 1);
        sum += b[Math.min(n - 1, y + radius + 1) * n + x] - b[Math.max(0, y - radius) * n + x];
      }
    }
  }
  return a;
}

// Height field (1 = flat metal, 0 = floor of the engraving) -> tangent-space normal map canvas.
function normalMapFromHeight(height, n, depth) {
  const out = canvas(n);
  const g = out.getContext('2d');
  const img = g.createImageData(n, n);
  const at = (x, y) => height[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Canvas y runs down while texture v runs up, so the v gradient is (above - below).
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      const dy = (at(x, y - 1) - at(x, y + 1)) * 0.5;
      let nx = -dx * depth;
      let ny = -dy * depth;
      const len = Math.hypot(nx, ny, 1);
      nx /= len; ny /= len;
      const nz = 1 / len;
      const i = (y * n + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

/* The emissive map: the glyph at full value plus a soft halo around it, baked in. This is the "bloom on the Spark
   engravings only" of HERO.md. A post-processing bloom cannot be limited to the engravings (the metal's own
   highlights are brighter than the glyph and would bloom and tint too), so the glow is drawn here instead: it stays
   exactly on the engraving, costs nothing per frame and renders identically for the pre-rendered stills. */
function emissiveWithHalo(mask, n, haloRadius, haloGain) {
  const a = mask.getContext('2d').getImageData(0, 0, n, n).data;
  const core = new Float32Array(n * n);
  for (let i = 0; i < core.length; i++) core[i] = a[i * 4 + 3] / 255;
  const halo = blur(Float32Array.from(core), n, haloRadius, 3);
  const out = canvas(n);
  const g = out.getContext('2d');
  const img = g.createImageData(n, n);
  for (let i = 0; i < core.length; i++) {
    const v = Math.min(1, core[i] + halo[i] * haloGain) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return out;
}

function texture(c, srgb, anisotropy) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

/* { front, top, back, bottom } -> { normalMap, emissiveMap }. `size` is the texture edge in px
   (1024 on High, 512 on Mid). `halo` is { radius (share of the texture edge), gain } for the baked glow. */
export async function buildEngravings({ size, anisotropy, halo }) {
  const out = {};
  const radius = Math.max(1, Math.round(size / 512));
  const haloRadius = Math.round(size * halo.radius);
  const depth = size / 64; // slope strength of the recess edge
  for (const [face, { src, fill }] of Object.entries(GLYPHS)) {
    const img = await loadImage(src);
    const mask = glyphMask(img, size, fill);
    const dark = paint(mask, size, '#000000', '#ffffff').getContext('2d').getImageData(0, 0, size, size).data;
    const height = new Float32Array(size * size);
    for (let i = 0; i < height.length; i++) height[i] = dark[i * 4] / 255;
    blur(height, size, radius, 2);
    out[face] = {
      normalMap: texture(normalMapFromHeight(height, size, depth), false, anisotropy),
      emissiveMap: texture(emissiveWithHalo(mask, size, haloRadius, halo.gain), true, anisotropy),
    };
  }
  return out;
}

/* Fine horizontal streaks for the machined faces. Used as a roughness map: the green channel scales the
   material roughness, so lighter streaks are rougher. Seeded, so it is identical on every load. */
export function buildBrushed({ size, anisotropy }) {
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(205,205,205)';
  g.fillRect(0, 0, size, size);
  const rand = mulberry32(3434);
  const strokes = Math.round((size * size) / 90);
  for (let i = 0; i < strokes; i++) {
    const v = Math.round(140 + rand() * 115);
    g.fillStyle = `rgba(${v},${v},${v},${(0.1 + rand() * 0.22).toFixed(3)})`;
    g.fillRect(rand() * size, rand() * size, 24 + rand() * size * 0.5, rand() < 0.18 ? 2 : 1);
  }
  return texture(c, false, anisotropy);
}
