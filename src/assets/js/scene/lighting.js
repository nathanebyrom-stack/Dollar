/* Lighting (HERO.md "Look"): one cool key, one silver rim, a soft environment for reflections.
   Lights are fixed in world space, so when the camera orbits the die the light appears to slide across the metal. */
import * as THREE from '../../vendor/three-r186/three.module.min.js';
import { RoomEnvironment } from '../../vendor/three-r186/addons/environments/RoomEnvironment.js';

const RIM_RADIUS = 4.2;
const RIM_START = -62 * Math.PI / 180; // behind-left: where the Arrival sweep starts
const RIM_REST = 38 * Math.PI / 180;   // behind-right: where it settles

export function createLights(scene, renderer) {
  // Reflections only: no visible background, and kept low so the die stays dark.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.42;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xdce6f5, 1.9);
  key.position.set(-3.4, 3.6, 4.2);
  scene.add(key);

  const rim = new THREE.SpotLight(0xcbd3de, 90, 16, 0.55, 0.7, 1.6);
  scene.add(rim, rim.target);

  const fill = new THREE.HemisphereLight(0xaeb6c2, 0x0c0e11, 0.14);
  scene.add(fill);

  // sweep: 0 = start (behind-left), 1 = rest (behind-right)
  function setRimSweep(sweep) {
    const a = RIM_START + (RIM_REST - RIM_START) * sweep;
    rim.position.set(Math.sin(a) * RIM_RADIUS, 1.5, -Math.cos(a) * RIM_RADIUS);
  }
  setRimSweep(1);

  return {
    setRimSweep,
    dispose() {
      envTexture.dispose();
      key.dispose(); rim.dispose(); fill.dispose();
    },
  };
}
