/* The 3D stage: one renderer on one fixed canvas behind the page text (ARCHITECTURE sections 5 and 6).
   Loaded by boot.js with dynamic import() after first paint, never in the critical path.

   Scroll does not move anything directly. The scroll timelines (timeline-home.js) tween the plain `state`
   object below, and this module reads `state` every frame to place the camera, die and lights. That keeps the
   render loop independent of ScrollTrigger and lets it pause when the canvas is off screen.

   Failure paths all land on the Low tier (no canvas, the page is just its HTML): a lost WebGL context, a shader
   that fails to compile, or frame times too slow for the tier. The tier only ever falls. */
import * as THREE from '../../vendor/three-r186/three.module.min.js';
import { createDie } from './die.js';
import { createLights } from './lighting.js';
import { buildEngravings, buildBrushed } from './engravings.js';

const html = document.documentElement;
const ELEVATION = 0.12;          // radians above the die's equator: enough to read it as an object
const DRIFT = { y: [0.05, 0.35], x: [0.02, 0.27] }; // [amplitude rad, angular speed rad/s]: peak speed under 1 deg/s
const TILT_MAX = 4 * Math.PI / 180;
const SLOW_FRAME = 0.022;        // mean frame time (s) over the guard window that drops a tier
const GUARD_SECONDS = 2;

const hexToRgb = (hex) => {
  const n = parseInt(hex.trim().replace('#', ''), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};

/* The CSS owns the falloff (tokens.css `--bg-falloff`); High redraws it in the final shader from the same
   variables, so the two tiers match. Percentages in the tokens become 0..1 here. */
function readFalloff(stageEl) {
  const s = getComputedStyle(stageEl);
  const r = getComputedStyle(html);
  const pct = (name) => parseFloat(s.getPropertyValue(name)) / 100;
  return {
    x: pct('--falloff-x'), y: pct('--falloff-y'), rx: pct('--falloff-rx'), ry: pct('--falloff-ry'),
    inner: hexToRgb(r.getPropertyValue('--graphite-800')),
    outer: hexToRgb(r.getPropertyValue('--graphite-900')),
  };
}

export async function start({ tier: initialTier, forced, scene: sceneName }) {
  const gsap = window.gsap;
  const stageEl = document.querySelector('.scene-stage');
  if (!stageEl) throw new Error('scene stage element missing');
  let tier = initialTier;

  const header = document.querySelector('.site-header');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0; // the Arrival ramps this up from black
  let shaderFailed = false;
  renderer.debug.onShaderError = () => { shaderFailed = true; };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const lights = createLights(scene, renderer);

  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const engravings = await buildEngravings({
    size: tier === 'high' ? 1024 : 512,
    anisotropy,
    halo: tier === 'high' ? { radius: 0.024, gain: 0.8 } : { radius: 0.016, gain: 0.55 },
  });
  const brushed = buildBrushed({ size: 512, anisotropy });
  const die = createDie({ tier, engravings, brushed });
  scene.add(die.root);

  // Everything the scroll timelines drive. glow is per engraved face, 0..1.
  const state = {
    azHero: 0, azPin: 0, // the camera azimuth is their sum: each timeline owns one, so a rewind never clobbers the other
    scrollDolly: 1, arrivalDolly: 1.14, shift: 0, yawMix: 0, roll: 0, fade: 0,
    exposure: 0, rim: 0, glow: { front: 0, top: 0, back: 0, bottom: 0 },
  };

  /* ---- Size and layout ---- */
  const size = { w: 0, h: 0 };
  let falloff = readFalloff(stageEl);
  let post = null; // { composer, render, setSize, ... } on High
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, tier === 'high' ? 2 : 1.5);

  function resize() {
    const w = stageEl.clientWidth;
    const h = stageEl.clientHeight;
    if (!w || !h || (w === size.w && h === size.h)) return;
    size.w = w; size.h = h;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    falloff = readFalloff(stageEl);
    if (post) { post.setSize(w, h, pixelRatio()); post.setFalloffCentre(falloff.x, falloff.y); }
  }

  // Desktop: die sits right of centre, text on the left. Phones: die in the upper part, text below it.
  function applyLayout(az) {
    // The die scales with viewport height, so on narrower desktops it is pulled back to leave room for the text column.
    const narrow = size.w >= 900 ? Math.min(1.45, Math.max(1, 1280 / size.w)) : 1;
    const dist = (size.w / size.h >= 1 ? 5 : 5 / Math.pow(size.w / size.h, 0.55)) * narrow * state.arrivalDolly * state.scrollDolly;
    const cosEl = Math.cos(ELEVATION);
    camera.position.set(Math.sin(az) * cosEl * dist, Math.sin(ELEVATION) * dist, Math.cos(az) * cosEl * dist);
    camera.lookAt(0, 0, 0);
    const wide = size.w >= 900;
    const offX = wide ? -size.w * (0.14 + 0.10 * state.shift) : 0;
    // Phones: centre the die in the space below the (stacked, tall) header, so the menu never covers it.
    const headerH = header ? header.offsetHeight : 0;
    const offY = wide ? 0 : size.h / 2 - (headerH + 0.34 * (size.h - headerH));
    camera.setViewOffset(size.w, size.h, offX, offY, size.w, size.h);
  }

  /* ---- Pointer tilt (High, fine pointers only) ---- */
  const tiltTarget = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  if (tier === 'high' && matchMedia('(pointer: fine)').matches) {
    addEventListener('pointermove', (e) => {
      tiltTarget.y = (e.clientX / innerWidth - 0.5) * 2 * TILT_MAX;
      tiltTarget.x = (e.clientY / innerHeight - 0.5) * 2 * TILT_MAX;
    }, { passive: true });
  }

  /* ---- Frame ---- */
  let frames = 0;
  let lastT = 0;
  let guard = null; // { elapsed, total, n } while measuring frame times after the Arrival
  let disposed = false;

  function render(timeMs) {
    const t = timeMs / 1000;
    const dt = lastT ? Math.min(t - lastT, 0.25) : 0.016;
    lastT = t;

    resize();
    const k = Math.min(1, dt * 4);
    tilt.x += (tiltTarget.x - tilt.x) * k;
    tilt.y += (tiltTarget.y - tilt.y) * k;

    const az = state.azHero + state.azPin;
    die.root.rotation.y = az;
    die.tilt.rotation.set(tilt.x + Math.sin(t * DRIFT.x[1]) * DRIFT.x[0], tilt.y + Math.sin(t * DRIFT.y[1]) * DRIFT.y[0], 0);
    die.yaw.rotation.y = az * (state.yawMix - 1);
    die.roll.rotation.x = state.roll * Math.PI / 2;
    die.setGlow(state.glow, tier);
    die.setFade(state.fade);
    lights.setRimSweep(state.rim);
    renderer.toneMappingExposure = state.exposure;
    applyLayout(az);

    if (post) post.render(); else renderer.render(scene, camera);
    frames++;

    if (shaderFailed) { shaderFailed = false; dropTier('shader failed to compile'); return; }
    if (frames === 1) onFirstFrame();
    if (guard) {
      guard.elapsed += dt; guard.total += dt; guard.n++;
      if (guard.elapsed >= GUARD_SECONDS) {
        const mean = guard.total / guard.n;
        guard = null;
        if (mean > SLOW_FRAME) dropTier(`slow frames (${(mean * 1000).toFixed(1)} ms mean)`);
      }
    }
  }

  /* ---- Loop control: run only while a scene section is on screen and the tab is visible ---- */
  let running = false;
  let lost = false;
  const visible = new Set();
  function updateLoop() {
    const want = !disposed && !lost && visible.size > 0 && document.visibilityState === 'visible';
    if (want && !running) { running = true; lastT = 0; renderer.setAnimationLoop(render); }
    else if (!want && running) { running = false; renderer.setAnimationLoop(null); }
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target));
    updateLoop();
  });
  document.querySelectorAll('[data-scene-active]').forEach((el) => io.observe(el));
  document.addEventListener('visibilitychange', updateLoop);

  /* ---- Tier changes (only ever downwards) ---- */
  function setTierAttr() { html.dataset.tier = tier; }

  function dropTier(reason) {
    if (disposed || tier === 'low') return;
    console.warn(`Scene: dropping from ${tier} tier: ${reason}`);
    if (tier === 'high') {
      tier = 'mid';
      if (post) { post.dispose(); post = null; }
      tiltTarget.x = tiltTarget.y = 0;
      resize(); // pixel ratio cap
      setTierAttr();
    } else {
      toLow(reason);
    }
  }

  function toLow(reason) {
    if (disposed) return;
    console.warn(`Scene: showing the page without 3D (${reason})`);
    tier = 'low';
    setTierAttr();
    dispose();
  }

  function dispose() {
    disposed = true;
    renderer.setAnimationLoop(null);
    io.disconnect();
    document.removeEventListener('visibilitychange', updateLoop);
    if (post) post.dispose();
    die.dispose(); lights.dispose();
    renderer.dispose();
    canvas.remove();
  }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; updateLoop(); toLow('WebGL context lost'); });

  /* ---- Mount ---- */
  stageEl.appendChild(canvas);
  resize();
  if (tier === 'high') {
    const mod = await import('./post.js');
    post = mod.createComposer({ renderer, scene, camera, width: size.w, height: size.h, pixelRatio: pixelRatio(), falloff });
  }
  setTierAttr();

  function onFirstFrame() {
    canvas.classList.add('is-ready');
    html.classList.add('scene-on');
    // Arrival (HERO.md): resolve out of black while the rim light sweeps across the bevels. Heavy and precise: no bounce.
    gsap.timeline({ defaults: { ease: 'power2.out' } })
      .to(state, { exposure: 1, duration: 1.4 }, 0)
      .to(state, { rim: 1, duration: 1.8, ease: 'power2.inOut' }, 0)
      .to(state, { arrivalDolly: 1, duration: 1.9, ease: 'power3.out' }, 0)
      .to(state.glow, { front: 1, duration: 1.2 }, 0.4)
      .call(() => { if (!forced) guard = { elapsed: 0, total: 0, n: 0 }; }, null, 1.5);
    if (sceneName === 'home') {
      import('./timeline-home.js')
        .then((m) => m.buildHomeTimelines({ state, tier }))
        .catch((err) => console.error('Scene: scroll timelines failed to build', err));
    }
  }

  // Compile every shader before the first visible frame: a failure drops the tier instead of showing a blank hero.
  renderer.compile(scene, camera);

  updateLoop();
  window.__scene = { state, die, get tier() { return tier; }, get frames() { return frames; }, get post() { return post; }, camera, renderer, dropTier };
  return { state, dispose };
}
