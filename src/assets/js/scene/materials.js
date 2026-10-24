/* Die materials (HERO.md "Object"): graphite metal faces, brushed-silver bevels, and per-face engravings.
   Colour values come from the confirmed palette. There is no gold anywhere on the die.

   High uses MeshPhysicalMaterial (anisotropic bevels); Mid uses MeshStandardMaterial. Every material is
   transparent at opacity 1 so the whole die can fade out when the Work section arrives. */
import * as THREE from '../../vendor/three-r186/three.min.js';

// emissiveIntensity of an engraving at full glow. HERO.md: "faintly": the symbol reads as a lit inlay in the metal,
// not a white print. The halo around it is baked into the emissive map (engravings.js).
export const GLOW_MAX = { high: 0.6, mid: 0.45 };
const SPARK = 0xf2f5fa;

// Order matches BoxGeometry's sides, then the bevel group: right, left, top, bottom, front, back, bevel.
export const FACE_INDEX = { right: 0, left: 1, top: 2, bottom: 3, front: 4, back: 5, bevel: 6 };

export function createMaterials({ tier, engravings, brushed }) {
  const Physical = tier === 'high';
  const Material = Physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;

  const faceBase = {
    color: 0x42474e,
    metalness: 0.92,
    roughness: 0.55,
    roughnessMap: brushed,
    transparent: true,
  };

  // Side faces (D15): engraved text, stamped like a data plate — a recess in the metal, never lit.
  const stamped = (face) => new Material({
    ...faceBase,
    normalMap: engravings[face].normalMap,
    normalScale: new THREE.Vector2(1, 1),
  });

  const engraved = (face) => {
    const m = new Material({
      ...faceBase,
      normalMap: engravings[face].normalMap,
      normalScale: new THREE.Vector2(1, 1),
      emissive: SPARK,
      emissiveMap: engravings[face].emissiveMap,
      emissiveIntensity: 0,
    });
    return m;
  };

  const bevel = new Material({
    color: 0xb4bdca,
    metalness: 1,
    roughness: 0.36,
    transparent: true,
    ...(Physical ? { anisotropy: 0.65, anisotropyRotation: Math.PI / 2 } : {}),
  });

  const materials = [];
  materials[FACE_INDEX.right] = stamped('right');
  materials[FACE_INDEX.left] = stamped('left');
  materials[FACE_INDEX.top] = engraved('top');
  materials[FACE_INDEX.bottom] = engraved('bottom');
  materials[FACE_INDEX.front] = engraved('front');
  materials[FACE_INDEX.back] = engraved('back');
  materials[FACE_INDEX.bevel] = bevel;
  return materials;
}
