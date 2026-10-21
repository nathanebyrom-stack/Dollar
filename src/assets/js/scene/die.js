/* The die: a rounded cube with its triangles sorted into material groups, and the transform hierarchy that
   lets the camera orbit, the die yaw to face it and the Services rolls all happen without fighting each other
   (ARCHITECTURE section 5).

     root   rotation.y = camera azimuth, so its local axes follow the camera (pointer tilt and drift live below it)
      tilt  idle drift + pointer tilt, in camera space
       yaw  rotation.y = azimuth * (yawMix - 1): net world yaw is azimuth * yawMix, so the die stays put while
            the camera orbits (yawMix 0) and turns to face it for the Services rolls (yawMix 1)
        roll  rotation.x = quarter-turns: about the camera's right-hand axis once yawMix is 1
         mesh */
import * as THREE from '../../vendor/three-r186/three.module.min.js';
import { RoundedBoxGeometry } from '../../vendor/three-r186/addons/geometries/RoundedBoxGeometry.js';
import { createMaterials, FACE_INDEX, GLOW_MAX } from './materials.js';

const RADIUS = 0.085;
const SIDE_AXIS = [0, 0, 1, 1, 2, 2]; // RoundedBoxGeometry/BoxGeometry side order: +x -x +y -y +z -z
const SIDE_SIGN = [1, -1, 1, -1, 1, -1];

/* Flat-face UVs. The roll is +90 degrees about X per step, so the top face arrives at the front after one roll,
   the back after two and the bottom after three. Each map below makes an upright texture read upright at the
   moment its face reaches the front (x is the screen's right, v is up):
     front  v = y        top  v = -z        back  v = -y        bottom  v = z                                  */
const UV = [
  (x, y, z) => [z + 0.5, y + 0.5],  // +x (plain)
  (x, y, z) => [z + 0.5, y + 0.5],  // -x (plain)
  (x, y, z) => [x + 0.5, 0.5 - z],  // +y top
  (x, y, z) => [x + 0.5, z + 0.5],  // -y bottom
  (x, y, z) => [x + 0.5, y + 0.5],  // +z front
  (x, y, z) => [x + 0.5, 0.5 - y],  // -z back
];

/* RoundedBoxGeometry is non-indexed with six equal runs of triangles, one per side. Sort the triangles into
   one group per flat face plus a seventh for the bevels, and give the flat faces linear (planar) UVs: the
   geometry's own UVs are spread by arc length, which would warp an engraving. */
export function buildGeometry(segments) {
  const src = new RoundedBoxGeometry(1, 1, 1, segments, RADIUS);
  const pos = src.attributes.position.array;
  const nor = src.attributes.normal.array;
  const uv = src.attributes.uv.array;
  const triangles = pos.length / 9;
  const perSide = triangles / 6;
  const flatExtent = 0.5 - RADIUS + 1e-4;
  const eps = 1e-4;

  const buckets = Array.from({ length: 7 }, () => []);
  for (let t = 0; t < triangles; t++) {
    const side = Math.floor(t / perSide);
    const axis = SIDE_AXIS[side];
    let flat = true;
    for (let v = 0; v < 3 && flat; v++) {
      const base = (t * 3 + v) * 3;
      for (let k = 0; k < 3; k++) {
        const p = pos[base + k];
        if (k === axis ? Math.abs(p - SIDE_SIGN[side] * 0.5) > eps : Math.abs(p) > flatExtent) { flat = false; break; }
      }
    }
    buckets[flat ? side : FACE_INDEX.bevel].push(t);
  }

  const total = triangles * 3;
  const outPos = new Float32Array(total * 3);
  const outNor = new Float32Array(total * 3);
  const outUv = new Float32Array(total * 2);
  const geometry = new THREE.BufferGeometry();
  let cursor = 0;
  buckets.forEach((list, group) => {
    const start = cursor;
    for (const t of list) {
      for (let v = 0; v < 3; v++) {
        const s = t * 3 + v;
        outPos.set(pos.subarray(s * 3, s * 3 + 3), cursor * 3);
        outNor.set(nor.subarray(s * 3, s * 3 + 3), cursor * 3);
        if (group < 6) {
          const [u, w] = UV[group](pos[s * 3], pos[s * 3 + 1], pos[s * 3 + 2]);
          outUv[cursor * 2] = u; outUv[cursor * 2 + 1] = w;
        } else {
          outUv[cursor * 2] = uv[s * 2]; outUv[cursor * 2 + 1] = uv[s * 2 + 1];
        }
        cursor++;
      }
    }
    geometry.addGroup(start, cursor - start, group);
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(outNor, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
  src.dispose();
  return geometry;
}

export function createDie({ tier, engravings, brushed }) {
  const geometry = buildGeometry(tier === 'high' ? 6 : 4);
  const materials = createMaterials({ tier, engravings, brushed });
  const mesh = new THREE.Mesh(geometry, materials);

  const roll = new THREE.Group(); roll.add(mesh);
  const yaw = new THREE.Group(); yaw.add(roll);
  const tilt = new THREE.Group(); tilt.add(yaw);
  const root = new THREE.Group(); root.add(tilt);

  const glowTargets = {
    front: materials[FACE_INDEX.front],
    top: materials[FACE_INDEX.top],
    back: materials[FACE_INDEX.back],
    bottom: materials[FACE_INDEX.bottom],
  };
  const unique = [...new Set(materials)];

  return {
    root, tilt, yaw, roll, mesh,
    // glow: 0..1 per engraved face; tier picks how bright full glow is
    setGlow(glow, glowTier) {
      const max = GLOW_MAX[glowTier] ?? GLOW_MAX.mid;
      for (const face in glowTargets) glowTargets[face].emissiveIntensity = (glow[face] || 0) * max;
    },
    // 1 = solid, 0 = gone; scale shrinks with it for the Work hand-off
    setFade(fade) {
      const opacity = 1 - fade;
      for (const m of unique) m.opacity = opacity;
      root.visible = opacity > 0.002;
      root.scale.setScalar(1 - 0.4 * fade);
    },
    dispose() {
      geometry.dispose();
      for (const m of unique) m.dispose();
    },
  };
}
