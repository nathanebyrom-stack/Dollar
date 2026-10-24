/* The atmosphere (decision D19, Nathan 24 Oct, from his Quantum reference): the die no longer floats in empty
   black — a field of silver light motes hangs in the space around it, at every depth, so the camera's orbit
   reveals a world rather than a backdrop. Nearest and farthest motes swell soft and dim (a bokeh, as if the
   camera were focused on the die); each breathes on its own slow phase. Everything is drawn in one Points draw
   call with the motion computed in the vertex shader, so the field costs almost nothing per frame.

   Rules it obeys: Spark and Silver only (no gold off the logo, HERO.md); it stills under "Pause motion"
   (stage.js scales its clock by driftK) and never exists under reduced motion or on the Low path (no 3D there);
   it is hidden during the bloom's emissive-only pass (it is light, not an engraving) and fades with the die at
   the Work hand-off so the gallery keeps the stage. */
import * as THREE from '../../vendor/three-r186/three.min.js';

const COUNT = { high: 650, mid: 320 };
const SILVER = [0xcb / 255, 0xd3 / 255, 0xde / 255];
const SPARK = [0xf2 / 255, 0xf5 / 255, 0xfa / 255];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDust({ tier }) {
  const count = COUNT[tier] || COUNT.mid;
  const rand = mulberry32(3400 + 34); // seeded: the field is identical on every visit
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4); // phase, breathe speed, drift amplitude, colour mix

  for (let i = 0; i < count; i++) {
    // A hollow shell of space around the die (die radius ~0.7): nothing inside 1.6, thinning out to 13.
    const r = 1.6 + Math.pow(rand(), 1.6) * 11.4;
    const theta = rand() * Math.PI * 2;
    const y = (rand() * 2 - 1);
    const flat = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(theta) * flat * r;
    positions[i * 3 + 1] = y * r * 0.72; // a slightly squashed cloud: wider than tall, like a workshop's air
    positions[i * 3 + 2] = Math.sin(theta) * flat * r;
    seeds[i * 4] = rand() * Math.PI * 2;
    seeds[i * 4 + 1] = 0.25 + rand() * 0.5;
    seeds[i * 4 + 2] = 0.08 + rand() * 0.22;
    seeds[i * 4 + 3] = rand();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 0 },      // 0 at Arrival, ramps to 1, multiplied down at the Work hand-off
      uPixelRatio: { value: 1 },
      uSilver: { value: new THREE.Vector3(...SILVER) },
      uSpark: { value: new THREE.Vector3(...SPARK) },
    },
    vertexShader: /* glsl */`
      attribute vec4 seed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vBreathe;
      varying float vMix;
      varying float vFocus;
      void main() {
        vec3 p = position;
        // A slow private drift: each mote sways on its own phase, never in step with its neighbours.
        p.x += sin(uTime * seed.y + seed.x) * seed.z;
        p.y += sin(uTime * seed.y * 0.8 + seed.x * 2.1) * seed.z * 0.6;
        p.z += cos(uTime * seed.y * 0.6 + seed.x * 1.3) * seed.z;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        // The camera is focused on the die: motes near its distance are small, sharp points; nearer or
        // farther ones swell into soft, dim discs — the bokeh that gives the space its depth.
        float focus = clamp(abs(dist - 5.0) / 9.0, 0.0, 1.0);
        vFocus = focus;
        vBreathe = 0.55 + 0.45 * sin(uTime * seed.y + seed.x * 3.7);
        vMix = seed.w;
        gl_PointSize = (2.0 + focus * 26.0) * uPixelRatio / max(dist * 0.22, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uFade;
      uniform vec3 uSilver;
      uniform vec3 uSpark;
      varying float vBreathe;
      varying float vMix;
      varying float vFocus;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float disc = smoothstep(1.0, 0.1, d);
        // Sharp motes are brighter; the big soft discs stay faint, as out-of-focus light does.
        float strength = mix(0.5, 0.06, vFocus) * vBreathe * uFade;
        vec3 colour = mix(uSilver, uSpark, vMix);
        gl_FragColor = vec4(colour * disc * strength, disc * strength);
      }`,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; // one draw call; the field surrounds the camera's whole orbit

  let time = 0;
  return {
    points,
    // dt is already scaled by the pause control's driftK, so the air stands still when motion is paused.
    update(dt, fade, pixelRatio) {
      time += dt;
      material.uniforms.uTime.value = time;
      material.uniforms.uFade.value = fade;
      material.uniforms.uPixelRatio.value = pixelRatio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
