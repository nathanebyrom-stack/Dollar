/* High tier only: tone mapping, then one final pass that lays the die over the page's radial falloff and adds
   very fine film grain (HERO.md "Look"; ARCHITECTURE section 15).

   Bloom (decision D9, Nathan 23 Oct): HERO.md's "subtle bloom on the Spark engravings only" is real here, done
   selectively rather than by threshold. A threshold bloom cannot be limited to the engravings (the metal's own
   highlights exceed the glyph and would bloom and tint, ACES shifts them toward beige), so instead the scene is
   rendered a second time at quarter resolution with the lights off, the environment at zero and every die material's
   colour black, which leaves exactly the emissive engravings and nothing else. That layer is blurred (two separable
   Gaussian passes at widening steps) and added after tone mapping, so the Spark glow keeps its own near-white colour.
   The glow still reads from the emissive maps, so the baked halo remains the Mid-tier look and the stills' look;
   High layers the true radiance on top. `setBloom(0..1)` scales it: the Arrival ramps it in, and it breathes with
   each face's glow because the source is the live emissiveIntensity.

   Why the final pass draws the background: the canvas is otherwise transparent over the CSS falloff, and bloom
   plus tone mapping do not combine cleanly with a transparent canvas. So on High the canvas is opaque, and this
   pass reproduces the CSS `--bg-falloff` gradient from the same two colours and centre, read from the tokens.
   Grain is per-pixel random noise changing every frame, never a regular or tiled pattern. */
import * as THREE from '../../vendor/three-r186/three.min.js';
import { EffectComposer } from '../../vendor/three-r186/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three-r186/addons/postprocessing/RenderPass.js';
import { OutputPass } from '../../vendor/three-r186/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../../vendor/three-r186/addons/postprocessing/ShaderPass.js';

// One separable 9-tap Gaussian step; `uStep` is the texel offset per tap (direction and spread together).
const BlurShader = {
  name: 'GlowBlurShader',
  uniforms: {
    tDiffuse: { value: null },
    uStep: { value: new THREE.Vector2(0, 0) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uStep;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
      c += (texture2D(tDiffuse, vUv + uStep).rgb + texture2D(tDiffuse, vUv - uStep).rgb) * 0.1945946;
      c += (texture2D(tDiffuse, vUv + uStep * 2.0).rgb + texture2D(tDiffuse, vUv - uStep * 2.0).rgb) * 0.1216216;
      c += (texture2D(tDiffuse, vUv + uStep * 3.0).rgb + texture2D(tDiffuse, vUv - uStep * 3.0).rgb) * 0.054054;
      c += (texture2D(tDiffuse, vUv + uStep * 4.0).rgb + texture2D(tDiffuse, vUv - uStep * 4.0).rgb) * 0.016216;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const FinishShader = {
  name: 'FinishShader',
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    uBloom: { value: 0 },
    uTime: { value: 0 },
    uGrain: { value: 0.028 },
    uInner: { value: new THREE.Vector3() },   // sRGB 0..1, deliberately not a THREE.Color (no colour management)
    uOuter: { value: new THREE.Vector3() },
    uCentre: { value: new THREE.Vector2(0.68, 0.42) }, // fractions of the viewport, y down (as in CSS)
    uRadius: { value: new THREE.Vector2(0.7, 0.62) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform float uBloom;
    uniform float uTime;
    uniform float uGrain;
    uniform vec3 uInner;
    uniform vec3 uOuter;
    uniform vec2 uCentre;
    uniform vec2 uRadius;
    varying vec2 vUv;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vec2(vUv.x, 1.0 - vUv.y);
      float t = clamp(length((q - uCentre) / uRadius), 0.0, 1.0);
      vec3 bg = mix(uInner, uOuter, t);
      // The render target is premultiplied (transparent clear, normal blending), so the die adds, bg fills the rest.
      vec3 col = c.rgb + bg * (1.0 - c.a);
      // The engravings' true radiance: an emissive-only render, blurred, added after tone mapping so Spark stays Spark.
      col += texture2D(tBloom, vUv).rgb * uBloom;
      col += (hash(gl_FragCoord.xy + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createComposer({ renderer, scene, camera, width, height, pixelRatio, falloff }) {
  const target = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, {
    type: THREE.HalfFloatType,
    samples: 4,
  });

  /* ---- Selective bloom (see the header comment). Quarter-resolution ping-pong targets. ---- */
  const GLOW_SCALE = 0.25;
  const glowOptions = { type: THREE.HalfFloatType, depthBuffer: true };
  let glowA = new THREE.WebGLRenderTarget(1, 1, glowOptions);
  let glowB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  // Cleared once so sampling it before the first glow render reads black (the tree-shaken build has no DataTexture).
  renderer.setRenderTarget(glowA);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.setRenderTarget(null);
  const blurMaterial = new THREE.ShaderMaterial({ ...BlurShader, uniforms: THREE.UniformsUtils.clone(BlurShader.uniforms) });
  const blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
  const blurScene = new THREE.Scene();
  blurScene.add(blurQuad);
  const blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let glow = null; // { materials: [{ material, colour }], lights } once stage.js hands them over
  let bloom = 0;

  function sizeGlow(w, h, pr) {
    const gw = Math.max(2, Math.round(w * pr * GLOW_SCALE));
    const gh = Math.max(2, Math.round(h * pr * GLOW_SCALE));
    glowA.setSize(gw, gh);
    glowB.setSize(gw, gh);
  }
  sizeGlow(width, height, pixelRatio);

  // Render the scene with only its emissive output: lights off, environment zero, every die material's colour black.
  function renderGlow() {
    const saved = {
      target: renderer.getRenderTarget(),
      autoClear: renderer.autoClear,
      env: scene.environmentIntensity,
    };
    for (const { material } of glow.materials) material.color.setScalar(0);
    for (const light of glow.lights) light.visible = false;
    scene.environmentIntensity = 0;

    renderer.autoClear = true;
    renderer.setRenderTarget(glowA);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);

    for (const { material, colour } of glow.materials) material.color.copy(colour);
    for (const light of glow.lights) light.visible = true;
    scene.environmentIntensity = saved.env;

    // Two separable Gaussian passes at widening steps: a soft halo without a visible kernel edge.
    for (const spread of [1, 2.5]) {
      blurMaterial.uniforms.uStep.value.set(spread / glowA.width, 0);
      blurMaterial.uniforms.tDiffuse.value = glowA.texture;
      renderer.setRenderTarget(glowB);
      renderer.render(blurScene, blurCamera);
      blurMaterial.uniforms.uStep.value.set(0, spread / glowA.height);
      blurMaterial.uniforms.tDiffuse.value = glowB.texture;
      renderer.setRenderTarget(glowA);
      renderer.render(blurScene, blurCamera);
    }

    renderer.setRenderTarget(saved.target);
    renderer.autoClear = saved.autoClear;
    return glowA.texture;
  }
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  composer.addPass(new RenderPass(scene, camera));
  const output = new OutputPass();
  composer.addPass(output);
  const finish = new ShaderPass(FinishShader);
  finish.uniforms.tBloom.value = glowA.texture;
  finish.uniforms.uInner.value.set(...falloff.inner);
  finish.uniforms.uOuter.value.set(...falloff.outer);
  finish.uniforms.uCentre.value.set(falloff.x, falloff.y);
  finish.uniforms.uRadius.value.set(falloff.rx, falloff.ry);
  composer.addPass(finish);

  // The Work gallery (frames.js) adds two overlay passes: the frame bodies before tone mapping, lit and tone mapped
  // with the die, and the screens after it, as raw display values so a video keeps its own colours.
  let galleryPasses = null;
  return {
    composer,
    setGallery(gallery) {
      this.clearGallery();
      const bodies = new RenderPass(gallery.bodies, gallery.camera);
      const screens = new RenderPass(gallery.screens, gallery.camera);
      for (const pass of [bodies, screens]) { pass.clear = false; pass.clearDepth = true; }
      composer.insertPass(bodies, 1);
      composer.insertPass(screens, composer.passes.indexOf(output) + 1);
      galleryPasses = { gallery, bodies, screens };
    },
    clearGallery() {
      if (!galleryPasses) return;
      for (const pass of [galleryPasses.bodies, galleryPasses.screens]) {
        const at = composer.passes.indexOf(pass);
        if (at !== -1) composer.passes.splice(at, 1);
        pass.dispose();
      }
      galleryPasses = null;
    },
    // The die's materials and lights, for the emissive-only glow pass. Colours are copied once, here.
    setGlowSources({ materials, lights }) {
      glow = { materials: materials.map((material) => ({ material, colour: material.color.clone() })), lights };
    },
    setBloom(strength) { bloom = strength; },
    render() {
      finish.uniforms.uTime.value = Math.random() * 1000; // fresh noise every frame
      const blooming = glow && bloom > 0.004;
      finish.uniforms.uBloom.value = blooming ? bloom : 0;
      if (blooming) finish.uniforms.tBloom.value = renderGlow();
      if (galleryPasses) galleryPasses.bodies.enabled = galleryPasses.screens.enabled = galleryPasses.gallery.active;
      composer.render();
    },
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      sizeGlow(w, h, pr);
    },
    setFalloffCentre(x, y) { finish.uniforms.uCentre.value.set(x, y); },
    dispose() {
      this.clearGallery();
      composer.dispose();
      target.dispose();
      glowA.dispose(); glowB.dispose();
      blurMaterial.dispose(); blurQuad.geometry.dispose();
    },
  };
}
