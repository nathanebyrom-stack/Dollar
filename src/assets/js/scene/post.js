/* High tier only: tone mapping, then one final pass that lays the die over the page's radial falloff and adds
   very fine film grain (HERO.md "Look"; ARCHITECTURE section 15). There is deliberately no bloom pass: a threshold
   bloom cannot be limited to the engravings (the metal's own highlights exceed the glyph and would bloom and tint,
   ACES shifts them toward beige), so the engraving glow is baked into the emissive map instead (engravings.js).

   Why the final pass draws the background: the canvas is otherwise transparent over the CSS falloff, and bloom
   plus tone mapping do not combine cleanly with a transparent canvas. So on High the canvas is opaque, and this
   pass reproduces the CSS `--bg-falloff` gradient from the same two colours and centre, read from the tokens.
   Grain is per-pixel random noise changing every frame, never a regular or tiled pattern. */
import * as THREE from '../../vendor/three-r186/three.module.min.js';
import { EffectComposer } from '../../vendor/three-r186/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three-r186/addons/postprocessing/RenderPass.js';
import { OutputPass } from '../../vendor/three-r186/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../../vendor/three-r186/addons/postprocessing/ShaderPass.js';

const FinishShader = {
  name: 'FinishShader',
  uniforms: {
    tDiffuse: { value: null },
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
      col += (hash(gl_FragCoord.xy + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createComposer({ renderer, scene, camera, width, height, pixelRatio, falloff }) {
  const target = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  finish.uniforms.uInner.value.set(...falloff.inner);
  finish.uniforms.uOuter.value.set(...falloff.outer);
  finish.uniforms.uCentre.value.set(falloff.x, falloff.y);
  finish.uniforms.uRadius.value.set(falloff.rx, falloff.ry);
  composer.addPass(finish);

  return {
    composer,
    render() {
      finish.uniforms.uTime.value = Math.random() * 1000; // fresh noise every frame
      composer.render();
    },
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    },
    setFalloffCentre(x, y) { finish.uniforms.uCentre.value.set(x, y); },
    dispose() {
      composer.dispose();
      target.dispose();
    },
  };
}
