/* The 3D stage: one renderer on one fixed canvas behind the page text (ARCHITECTURE sections 5 and 6).
   Loaded by boot.js with dynamic import() after first paint, never in the critical path.

   Scroll does not move anything directly. The scroll timelines (timeline-home.js) tween the plain `state`
   object below, and this module reads `state` every frame to place the camera, die and lights. That keeps the
   render loop independent of ScrollTrigger and lets it pause when the canvas is off screen.

   Failure paths all land on the Low tier (no canvas, the page is just its HTML): a lost WebGL context, a shader
   that fails to compile, or frame times too slow for the tier. The tier only ever falls. */
import * as THREE from '../../vendor/three-r186/three.min.js';
import { createDie } from './die.js';
import { createLights } from './lighting.js';
import { buildEngravings, buildBrushed } from './engravings.js';
import { createDieLabel } from './label.js';
import { createDust } from './dust.js';
import { createSwarm } from './swarm.js';

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

// ?still=<name> renders one face square-on on a transparent canvas for tools/stills (not a visitor feature).
const STILLS = { '34': { roll: 0, face: 'front' }, 'web-design': { roll: 1, face: 'top' }, 'marketing': { roll: 2, face: 'back' }, 'workflow-automation': { roll: 3, face: 'bottom' } };

export async function start({ tier: initialTier, forced, scene: sceneName, still: stillName, onLow }) {
  const stillSpec = stillName ? STILLS[stillName] : null;
  if (stillName && !stillSpec) throw new Error(`unknown still "${stillName}"`);
  const gsap = window.gsap;
  const stageEl = document.querySelector('.scene-stage');
  if (!stageEl) throw new Error('scene stage element missing');
  let tier = initialTier;

  const header = document.querySelector('.site-header');
  const frame = stageEl.querySelector('.die-frame'); // CSS decides where the die sits; the camera conforms (see measureLayout)
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
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

  // The atmosphere (D19): a field of silver motes at every depth around the die. Not on a still render.
  const dust = stillSpec ? null : createDust({ tier });
  if (dust) scene.add(dust.points);

  // The swarm (D19 stage two): Home only — it rides the Services rolls.
  const swarm = (sceneName === 'home' && !stillSpec) ? createSwarm({ tier, engravings }) : null;
  if (swarm) scene.add(swarm.points);

  // Everything the scroll timelines drive. glow is per engraved face, 0..1.
  const state = {
    azHero: 0, azPin: 0, // the camera azimuth is their sum: each timeline owns one, so a rewind never clobbers the other
    scrollDolly: 1, shift: 0, yawMix: 0, roll: 0, fade: 0,
    // The pre-rendered still is already on screen, so the live die starts from the same look (exposure 1, "34" lit)
    // and the Arrival is the rim light sweeping across the bevels, not a fade up from black. bloom (High only, D9)
    // starts at zero so the engravings' true radiance blooms outward during the sweep: pure addition, no flash.
    exposure: 1, rim: 0.55, bloom: 0, air: 0, glow: { front: 1, top: 0, back: 0, bottom: 0 },
  };
  // A service page rests on that service's own face (no rolls): the same state a still is drawn from.
  const SERVICE_FACES = { 'service:web': 'web-design', 'service:marketing': 'marketing', 'service:automation': 'workflow-automation' };
  const serviceSpec = STILLS[SERVICE_FACES[sceneName]] || null;
  if (serviceSpec) {
    state.yawMix = 1; state.roll = serviceSpec.roll;
    state.glow = { front: 0, top: 0, back: 0, bottom: 0, [serviceSpec.face]: 1 };
  }
  if (stillSpec) { // one face, square-on, lit as at rest
    state.rim = 1; state.yawMix = 1; state.roll = stillSpec.roll;
    state.glow = { front: 0, top: 0, back: 0, bottom: 0, [stillSpec.face]: 1 };
  }

  /* ---- Size and layout ---- */
  const size = { w: 0, h: 0 };
  let falloff = readFalloff(stageEl);
  let post = null; // { composer, render, setSize, ... } on High
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, tier === 'high' ? 2 : 1.5);

  // Where the die sits and how big it is, in CSS pixels: the centre of the frame and half its width (the face height).
  // CSS owns this (scenes.css), so the pre-rendered stills and the live die can never disagree.
  let layout = { cx: 0, cy: 0, die: 1 };
  function measureLayout() {
    if (stillSpec) { layout = { cx: size.w / 2, cy: size.h / 2, die: size.h / 2 }; return; }
    const r = frame ? frame.getBoundingClientRect() : null;
    if (r && r.width > 0) { layout = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, die: r.width / 2 }; return; }
    // No frame in the markup: a sensible default.
    const wide = size.w >= 900;
    const headerH = header ? header.offsetHeight : 0;
    layout = wide
      ? { cx: size.w * 0.64, cy: size.h / 2, die: Math.min(size.h * 0.38, size.w * 0.26) }
      : { cx: size.w / 2, cy: headerH + 0.34 * (size.h - headerH), die: Math.min(size.h * 0.27, size.w * 0.56) };
  }

  function resize() {
    const w = stageEl.clientWidth;
    const h = stageEl.clientHeight;
    if (!w || !h || (w === size.w && h === size.h)) return;
    size.w = w; size.h = h;
    renderer.setPixelRatio(stillSpec ? 1 : pixelRatio());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    falloff = readFalloff(stageEl);
    measureLayout();
    if (post) { post.setSize(w, h, pixelRatio()); post.setFalloffCentre(falloff.x, falloff.y); }
    if (gallery) gallery.resize();
  }

  const TAN_HALF_FOV = Math.tan(15 * Math.PI / 180); // the camera's vertical fov is 30 degrees
  function applyLayout(az) {
    // The die's front face is `layout.die` px tall: pick the distance that makes it so, then shift the view to its centre.
    // The face is half a unit nearer the camera than the die's centre, hence the + 0.5.
    const dist = (size.h / (2 * TAN_HALF_FOV * layout.die) + 0.5) * state.scrollDolly;
    const cosEl = Math.cos(ELEVATION);
    camera.position.set(Math.sin(az) * cosEl * dist, Math.sin(ELEVATION) * dist, Math.cos(az) * cosEl * dist);
    camera.lookAt(0, 0, 0);
    // Services moves the die further right on desktop; phones keep it centred.
    const shiftPx = size.w >= 900 ? size.w * 0.10 * state.shift : 0;
    camera.setViewOffset(size.w, size.h, size.w / 2 - layout.cx - shiftPx, size.h / 2 - layout.cy, size.w, size.h);
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
  let timelines = null; // the gsap context holding the scroll timelines, so they can be reverted
  let gallery = null;   // the Work gallery's 3D frames (frames.js), desktop only, created when Work is near
  let galleryScroll = null; // the gsap.matchMedia holding the Work pin
  let galleryWatch = null;  // IntersectionObserver / media query that start it

  // The idle drift's share: eased to zero while the visitor has pressed "Pause motion" (motion.js, WCAG 2.2.2).
  let driftK = 1;
  // How strongly the swarm is holding its symbol (one frame behind; see place): the metal dims beneath it.
  let swarmHold = 0;

  // The face caption (D18): follows the die, reads the dominant glowing face, fades with it and with the Work hand-off.
  const label = stillSpec ? null : createDieLabel(stageEl);
  let labelOpacity = -1;
  function placeLabel(shiftPx) {
    if (!label) return;
    let best = null;
    let bestG = 0;
    for (const face in state.glow) if (state.glow[face] > bestG) { bestG = state.glow[face]; best = face; }
    const faceName = { front: '34', top: 'web-design', back: 'marketing', bottom: 'workflow-automation' }[best];
    if (faceName) label.set(faceName);
    const opacity = Math.max(0, Math.min(1, (bestG - 0.35) / 0.65)) * (1 - state.fade);
    if (Math.abs(opacity - labelOpacity) > 0.005) { label.el.style.opacity = opacity.toFixed(3); labelOpacity = opacity; }
    label.el.style.transform = `translate(${Math.round(layout.cx + shiftPx)}px, ${Math.round(layout.cy + layout.die + 14)}px) translateX(-50%)`;
  }

  // Position the die, lights and camera for time `t` (seconds) from `state`. Pure placement: no drawing.
  function place(t) {
    const az = state.azHero + state.azPin;
    die.root.rotation.y = az;
    die.tilt.rotation.set(tilt.x + Math.sin(t * DRIFT.x[1]) * DRIFT.x[0] * driftK, tilt.y + Math.sin(t * DRIFT.y[1]) * DRIFT.y[0] * driftK, 0);
    die.yaw.rotation.y = az * (state.yawMix - 1);
    die.roll.rotation.x = state.roll * Math.PI / 2;
    die.setGlow(state.glow, tier);
    die.setFade(state.fade);
    lights.setRimSweep(state.rim);
    renderer.toneMappingExposure = state.exposure * (1 - swarmHold * 0.45);
    if (post) post.setBloom(state.bloom);
    applyLayout(az);
    placeLabel(size.w >= 900 ? size.w * 0.10 * state.shift : 0);
  }

  function render(timeMs) {
    const t = timeMs / 1000;
    const dt = lastT ? Math.min(t - lastT, 0.25) : 0.016;
    lastT = t;

    resize();
    const k = Math.min(1, dt * 4);
    tilt.x += (tiltTarget.x - tilt.x) * k;
    tilt.y += (tiltTarget.y - tilt.y) * k;
    driftK += ((html.classList.contains('motion-paused') ? 0 : 1) - driftK) * k;
    place(t);
    if (dust) dust.update(dt * driftK, state.air * (1 - state.fade), pixelRatio());
    if (swarm) { swarm.setPixelRatio(pixelRatio()); swarmHold = swarm.update(dt * driftK, state.roll, camera, die.root.position) || 0; }
    if (gallery) gallery.update(t, dt);

    if (post) post.render();
    else { renderer.render(scene, camera); if (gallery) gallery.renderDirect(renderer); }
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
  if (!stillSpec) document.querySelectorAll('[data-scene-active]').forEach((el) => io.observe(el));
  document.addEventListener('visibilitychange', updateLoop);

  /* ---- The Work gallery: created lazily, when the Work section is within one viewport (ARCHITECTURE section 4) ---- */
  function watchGallery() {
    if (sceneName !== 'home' || stillSpec || disposed) return;
    const section = document.getElementById('scene-work');
    const cards = section ? [...section.querySelectorAll('.work-card')] : [];
    if (!cards.length) return;
    const wide = matchMedia('(min-width: 900px)');
    let near = false;
    const maybeStart = () => { if (near && wide.matches && !gallery && !disposed) startGallery(cards).catch((err) => console.error('Scene: the Work gallery could not start', err)); };
    const io = new IntersectionObserver((entries) => { near = entries.some((e) => e.isIntersecting); maybeStart(); }, { rootMargin: '100% 0px' });
    io.observe(section);
    wide.addEventListener('change', maybeStart);
    galleryWatch = { stop() { io.disconnect(); wide.removeEventListener('change', maybeStart); } };
  }

  async function startGallery(cards) {
    const frames = await import('./frames.js');
    if (disposed || gallery) return;
    const created = frames.createGallery({ environment: scene.environment, tier, anisotropy, container: stageEl, cards });
    gallery = created;
    if (post) post.setGallery(created);
    const scroll = await import('./timeline-home.js');
    if (disposed || gallery !== created) return;
    galleryScroll = scroll.buildWorkGallery({ gallery: created, tier });
  }

  function stopGallery() {
    if (galleryWatch) { galleryWatch.stop(); galleryWatch = null; }
    if (galleryScroll) { galleryScroll.revert(); galleryScroll = null; }
    if (gallery) { if (post) post.clearGallery(); gallery.dispose(); gallery = null; }
  }

  /* ---- Tier changes (only ever downwards) ---- */
  function setTierAttr() { html.dataset.tier = tier; }

  function dropTier(reason) {
    if (disposed || tier === 'low') return;
    console.warn(`Scene: dropping from ${tier} tier: ${reason}`);
    if (tier === 'high') {
      stopGallery(); // its screens were drawn for the High pipeline: rebuild them for Mid
      tier = 'mid';
      if (post) { post.dispose(); post = null; }
      tiltTarget.x = tiltTarget.y = 0;
      resize(); // pixel ratio cap
      setTierAttr();
      watchGallery();
    } else {
      toLow(reason);
    }
  }

  function toLow(reason) {
    if (disposed) return;
    console.warn(`Scene: showing the page without 3D (${reason})`);
    tier = 'low';
    setTierAttr();
    stopGallery();
    dispose();
    // The live scroll timelines and their pin must go before the Low controller builds its own.
    if (timelines) { timelines.revert(); timelines = null; }
    html.classList.remove('scene-on', 'scene-live');
    if (onLow) onLow();
  }

  function dispose() {
    disposed = true;
    if (label) label.dispose();
    renderer.setAnimationLoop(null);
    io.disconnect();
    document.removeEventListener('visibilitychange', updateLoop);
    if (post) post.dispose();
    if (dust) dust.dispose();
    if (swarm) swarm.dispose();
    die.dispose(); lights.dispose();
    renderer.dispose();
    canvas.remove();
  }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; updateLoop(); toLow('WebGL context lost'); });

  /* ---- Mount ---- */
  stageEl.appendChild(canvas);
  resize();
  if (tier === 'high' && !stillSpec) {
    const mod = await import('./post.js');
    post = mod.createComposer({ renderer, scene, camera, width: size.w, height: size.h, pixelRatio: pixelRatio(), falloff });
    // The dust and swarm are light, not engravings: hidden with the lights during the emissive-only glow pass.
    post.setGlowSources({ materials: die.materials, lights: [...lights.all, dust, swarm].filter(Boolean).map((x) => x.points || x) });
  }
  setTierAttr();

  function onFirstFrame() {
    canvas.classList.add('is-ready');
    html.classList.add('scene-on', 'scene-live'); // scene-live hides the pre-rendered still behind the live die
    // Arrival (HERO.md): the die is already on screen as its still; the live one takes over and the rim light
    // sweeps across the bevels. Heavy and precise: no bounce.
    gsap.timeline({ defaults: { ease: 'power2.out' } })
      .to(state, { rim: 1, duration: 1.8, ease: 'power2.inOut' }, 0)
      // D9: the engravings' radiance blooms outward as the light sweeps. Additive only, so nothing dims or flashes.
      .to(state, { bloom: 1, duration: 2.1, ease: 'power2.inOut' }, 0.2)
      // D19: the air fills with light as the sweep crosses — the world resolves around the die.
      .to(state, { air: 1, duration: 2.6, ease: 'power2.inOut' }, 0.4)
      .call(() => { if (!forced) guard = { elapsed: 0, total: 0, n: 0 }; }, null, 1.5);
    if (serviceSpec) {
      import('./timeline-service.js')
        .then((m) => { if (!disposed) timelines = m.buildServiceTimeline({ state, tier }); })
        .catch((err) => console.error('Scene: scroll timelines failed to build', err));
    }
    if (sceneName === 'home') {
      watchGallery();
      import('./timeline-home.js')
        .then((m) => { if (!disposed) timelines = m.buildHomeTimelines({ state, tier }); })
        .catch((err) => console.error('Scene: scroll timelines failed to build', err));
    }
  }

  // Compile every shader before the first visible frame: a failure drops the tier instead of showing a blank hero.
  renderer.compile(scene, camera);

  if (stillSpec) {
    // tools/stills: draw once, deterministically (t = 0: no drift, no tilt), and hand back a transparent PNG.
    // The read must happen in the same task as the draw, because the drawing buffer is not preserved.
    window.__still = () => { resize(); place(0); renderer.render(scene, camera); return canvas.toDataURL('image/png'); };
    resize(); place(0); renderer.render(scene, camera); renderer.render(scene, camera);
    window.__stillReady = true;
    return { state, dispose };
  }

  updateLoop();
  window.__scene = { state, die, get tier() { return tier; }, get frames() { return frames; }, get post() { return post; }, get gallery() { return gallery; }, camera, renderer, dropTier };
  return { state, dispose };
}
