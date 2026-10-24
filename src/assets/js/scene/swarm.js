/* The swarm (decision D19 stage two, Nathan's yes, 24 Oct): during each Services roll, a cloud of Spark
   particles bursts off the die, gathers in the air between the visitor and the metal to form the ARRIVING
   face's symbol, then dives onto the face as it seats — where the engraving's own etch light-up (D15) takes
   over. One continuous story per roll: light leaves the metal, shows you what is coming, and becomes it.

   Mechanics: one Points draw call. Each particle has a seeded start on the die's shell and, per arriving face,
   a target sampled from that face's real engraving mask (so the formation IS the symbol, not an approximation).
   The journey is three envelopes computed per frame in JS from the roll's own fraction — scatter (burst off the
   shell), form (gather into the symbol), and alpha (fade as the face seats) — with all per-particle motion in
   the vertex shader. The formation is a camera-facing hologram in front of the die that settles back toward the
   face plane as the roll completes.

   Rules: Spark only (no gold off the logo). Driven entirely by scroll state, so it obeys the scrub exactly and
   needs nothing from "Pause motion" (its private turbulence clock is still scaled by driftK, so paused means no
   self-movement). Home only; never on Low or reduced-motion paths. Hidden from the bloom's emissive pass like
   the dust: two thousand additive points fed through the bloom wash out to a white blob — the swarm carries its
   own glow in its blending. */
import * as THREE from '../../vendor/three-r186/three.min.js';

const COUNT = { high: 2800, mid: 1500 };
const SPARK = [0xf2 / 255, 0xf5 / 255, 0xfa / 255];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// `count` points from the glyph's alpha mask, as face-plane coordinates in [-0.5, 0.5] (y up).
function sampleMask(mask, count, rand) {
  const n = mask.width;
  const data = mask.getContext('2d').getImageData(0, 0, n, n).data;
  const out = new Float32Array(count * 2);
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 400) {
    guard++;
    const x = rand() * n | 0;
    const y = rand() * n | 0;
    if (data[(y * n + x) * 4 + 3] > 128) {
      out[placed * 2] = x / n - 0.5;
      out[placed * 2 + 1] = 0.5 - y / n;
      placed++;
    }
  }
  // A mask too thin to sample (should not happen): the rest gather at the centre rather than at the origin corner.
  for (; placed < count; placed++) { out[placed * 2] = 0; out[placed * 2 + 1] = 0; }
  return out;
}

export function createSwarm({ tier, engravings }) {
  const count = COUNT[tier] || COUNT.mid;
  const rand = mulberry32(1934);

  // Per-face symbol targets, sampled once from the real engraving masks.
  const faceTargets = {};
  for (const face of ['top', 'back', 'bottom']) faceTargets[face] = sampleMask(engravings[face].mask, count, rand);

  const starts = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3); // phase, speed, spread
  for (let i = 0; i < count; i++) {
    // A seeded point on the die's shell (the unit cube's surface, pushed just proud of the metal).
    const axis = rand() * 3 | 0;
    const sign = rand() < 0.5 ? -1 : 1;
    const p = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
    p[axis] = sign * 0.52;
    starts.set(p, i * 3);
    seeds[i * 3] = rand() * Math.PI * 2;
    seeds[i * 3 + 1] = 0.6 + rand() * 1.4;
    seeds[i * 3 + 2] = 0.5 + rand() * 1.2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(starts, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
  const targetAttr = new THREE.BufferAttribute(new Float32Array(count * 2), 2);
  geometry.setAttribute('aTarget', targetAttr);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uScatter: { value: 0 },
      uForm: { value: 0 },
      uAlpha: { value: 0 },
      uPixelRatio: { value: 1 },
      uCentre: { value: new THREE.Vector3() },
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uSize: { value: 1.4 },
      uSpark: { value: new THREE.Vector3(...SPARK) },
    },
    vertexShader: /* glsl */`
      attribute vec3 seed;
      attribute vec2 aTarget;
      uniform float uTime, uScatter, uForm, uPixelRatio, uSize;
      uniform vec3 uCentre, uRight, uUp;
      varying float vTwinkle;
      void main() {
        // Burst: off the shell, each particle on its own swirling path.
        vec3 swirl = vec3(
          sin(uTime * seed.y + seed.x),
          cos(uTime * seed.y * 0.7 + seed.x * 2.3),
          sin(uTime * seed.y * 0.9 + seed.x * 4.1)
        ) * 0.33 * seed.z;
        vec3 burst = position * (1.0 + uScatter * (0.9 + seed.z)) + swirl * uScatter;
        // Formation: the arriving face's symbol, held in the air facing the visitor.
        vec3 formed = uCentre + (aTarget.x * uRight + aTarget.y * uUp) * uSize
                    + swirl * 0.03; // the held symbol still breathes, gently
        vec3 p = mix(burst, formed, uForm);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vTwinkle = 0.65 + 0.35 * sin(uTime * (1.5 + seed.y) + seed.x * 5.0);
        gl_PointSize = (1.6 + seed.z * 1.9) * uPixelRatio * 7.0 / max(-mv.z, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAlpha;
      uniform vec3 uSpark;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float disc = smoothstep(1.0, 0.15, d);
        float a = disc * uAlpha * vTwinkle * 0.75;
        gl_FragColor = vec4(uSpark * a, a);
      }`,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const ROLL_FACES = ['top', 'back', 'bottom']; // roll 0->1 arrives at top, 1->2 back, 2->3 bottom
  let loadedFace = null;
  let time = 0;
  const u = material.uniforms;

  return {
    points,
    /* roll: the live state.roll. dt is pre-scaled by driftK. camera/dieCentre: world-space, per frame.
       Returns the formation's hold strength (0..1): stage.js dips the die's exposure by it, so the metal
       dims while the light holds the symbol — the light leaves the metal to show you what is coming. */
    update(dt, roll, camera, dieCentre) {
      time += dt;
      u.uTime.value = time;
      const fraction = roll - Math.floor(roll);
      const active = fraction > 0.001 && fraction < 0.999 && roll < 3.001;
      if (!active) { u.uAlpha.value = 0; return 0; }

      const arriving = ROLL_FACES[Math.min(2, Math.floor(roll))];
      if (arriving !== loadedFace) {
        loadedFace = arriving;
        targetAttr.array.set(faceTargets[arriving]);
        targetAttr.needsUpdate = true;
      }

      // The journey, from the roll's own fraction: burst, form, dive onto the seating face, hand over to the etch.
      const ease = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      u.uScatter.value = ease(0.0, 0.3, fraction);
      u.uForm.value = ease(0.22, 0.58, fraction);
      const dive = ease(0.74, 0.97, fraction);
      u.uAlpha.value = ease(0.03, 0.14, fraction) * (1 - dive);

      // The hologram: camera-facing, in front of the die, settling back onto the face plane as it seats.
      const forward = camera.getWorldDirection(u.uRight.value).clone(); // reuse a vector, then rebuild uRight below
      const up = camera.up.clone();
      const right = up.clone().crossVectors(up, forward).normalize().multiplyScalar(-1);
      const trueUp = forward.clone().crossVectors(forward, right).normalize().multiplyScalar(-1);
      u.uRight.value.copy(right);
      u.uUp.value.copy(trueUp);
      const distance = 2.0 - dive * 1.48;
      u.uCentre.value.copy(dieCentre).addScaledVector(forward, -distance);
      u.uSize.value = 1.6 - dive * 0.65;
      return u.uForm.value * (1 - dive); // the hold strength: the metal dims while the symbol is held
    },
    setPixelRatio(pr) { u.uPixelRatio.value = pr; },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
