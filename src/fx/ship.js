import * as THREE from 'three';
import { solid } from './model.js';
import { SHAPES, GLASS } from './shapes.js';
import { RNG } from '../rng.js';
import { ESCORT_COLOR_HEX } from '../party/colors.js';

export const PLAYER_COLOR = 0x8a98a8;
export const ESCORT_COLORS = ESCORT_COLOR_HEX.map((h) => parseInt(h.slice(1), 16));

const flameGeo = new THREE.ShapeGeometry(new THREE.Shape(SHAPES.flame.map(([x, y]) => new THREE.Vector2(x, y))));
const shieldGeo = new THREE.RingGeometry(4.3, 4.7, 40);
const dotGeo = new THREE.CircleGeometry(0.28, 10);
const SCORCHED = new THREE.Color(0x4a4440);

// Part outlines (ship space: nose at +y 4, wingtips at ±3.2, tail at -3).
const PART = {
  nozzle: [[-0.3, 0.3], [0.3, 0.3], [0.38, -0.4], [-0.38, -0.4]],
  plate: [[-0.5, 0.35], [0.5, 0.35], [0.6, -0.35], [-0.6, -0.35]],
  pod: [[-0.35, 0.45], [0.35, 0.45], [0.4, 0.3], [0.4, -0.4], [0.3, -0.5], [-0.3, -0.5], [-0.4, -0.4], [-0.4, 0.3]],
  barrel: [[-0.12, 0.6], [0.12, 0.6], [0.12, -0.6], [-0.12, -0.6]],
  stub: [[-0.28, 0.5], [0.28, 0.5], [0.34, -0.4], [-0.34, -0.4]],
  launcher: [[-0.45, 0.8], [0.45, 0.8], [0.45, -0.8], [-0.45, -0.8]],
  rail: [[-0.1, 0.9], [0.1, 0.9], [0.1, -0.9], [-0.1, -0.9]],
};
const missileTipGeo = new THREE.ShapeGeometry(new THREE.Shape([[0, 0.35], [0.12, 0], [-0.12, 0]].map(([x, y]) => new THREE.Vector2(x, y))));
const PLATE_SPOTS = [[1.85, -1.7], [0.75, 0.9], [2.6, -2.6], [1.15, -0.6]]; // mirrored on both sides
const POD_SPOTS = [[-0.7, -1.3], [0.7, -1.3], [-0.7, -0.25], [0.7, -0.25]];
// Where battle damage appears, in the order it spreads, with the damage level that reveals it.
const SCORCH_SPOTS = [[1.9, -1.9, 0.15], [-1.6, -1.2, 0.3], [0.5, 1.6, 0.45], [-2.6, -2.7, 0.6], [2.7, -2.8, 0.72], [-0.4, -2.0, 0.85]];
const FIRE_SPOT = [1.9, -1.9];

function part(key, at, color, { depth = 0.3, z = 0.3 } = {}) {
  const m = solid(key, PART[key], color, { depth, edges: false });
  m.position.set(at[0], at[1], z);
  return m;
}

function glowDot(at, color, size = 1, z = 0.6) {
  const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color }));
  m.position.set(at[0], at[1], z);
  m.scale.setScalar(size);
  return m;
}

const scorchGeos = SCORCH_SPOTS.map((_, i) => {
  const rng = new RNG(77 + i);
  const n = 7;
  const pts = Array.from({ length: n }, (__, k) => {
    const a = (k / n) * Math.PI * 2;
    const r = rng.float(0.35, 0.8);
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r * 0.8);
  });
  return new THREE.ShapeGeometry(new THREE.Shape(pts));
});

// The player's ship. With a `loadout` ({ upgrades, weapons }) it shows what's installed;
// without one (escorts, menu) it's the stock hull.
export function createPlayerShip(color = PLAYER_COLOR, { shield = true, scale = 1, loadout = null } = {}) {
  const group = new THREE.Group();
  const hull = solid('player', SHAPES.player, color, { depth: 1, glass: GLASS.player });
  group.add(hull);
  const hullMat = hull.userData.model.mats[0];
  const baseColor = new THREE.Color(color);
  const u = loadout?.upgrades ?? {};
  const weapons = loadout?.weapons ?? [];

  // Engines: more and bigger nozzles; hot blue-white flames from level 5.
  const engine = u.engine ?? 1;
  const nozzleXs = engine >= 5 ? [-0.8, 0, 0.8] : engine >= 3 ? [-0.6, 0.6] : [0];
  const flame = new THREE.Group();
  flame.position.set(0, -3.0, 0.3);
  const flameMat = new THREE.MeshBasicMaterial({ color: engine >= 5 ? 0x9fd0ff : 0xff9933, transparent: true, opacity: 0.9 });
  const flameSize = (nozzleXs.length > 1 ? 0.65 : 1) * (0.85 + 0.06 * engine);
  for (const x of nozzleXs) {
    if (loadout) group.add(part('nozzle', [x, -2.55], 0x4a4f57, { depth: 0.25, z: 0.25 }));
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.x = x;
    f.scale.setScalar(flameSize);
    flame.add(f);
  }
  group.add(flame);

  if (loadout) {
    // Hull plating: armor plates at levels 3, 5, 7, 9.
    const plates = Math.min(4, Math.floor(((u.hull ?? 1) - 1) / 2));
    for (let i = 0; i < plates; i++) {
      for (const s of [-1, 1]) group.add(part('plate', [PLATE_SPOTS[i][0] * s, PLATE_SPOTS[i][1]], 0xa9b3bf));
    }
    // Shields: wingtip emitters, brighter with level (over 1.0 so bloom makes them glow).
    if ((u.shield ?? 0) > 0) {
      const c = new THREE.Color(0.35, 0.66, 1).multiplyScalar(0.6 + 0.12 * u.shield);
      for (const s of [-1, 1]) group.add(glowDot([3.0 * s, -2.9], c, 0.8 + 0.04 * u.shield));
    }
    // Weapons Core: a power line down the spine.
    if ((u.core ?? 1) >= 2) {
      const spine = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2, 2.0),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.22).multiplyScalar(0.3 + 0.17 * u.core) }),
      );
      spine.position.set(0, -1.0, 0.32);
      group.add(spine);
    }
    // Cargo Hold: up to four pods behind the canopy.
    const pods = Math.min(4, Math.floor((u.cargo ?? 1) / 2.5));
    for (let i = 0; i < pods; i++) group.add(part('pod', POD_SPOTS[i], 0x8a6a3e, { depth: 0.45 }));
    // Weapon mounts.
    group.add(part('barrel', [0, 4.1], 0x3b3f45));
    group.add(glowDot([0, 4.7], 0x33ffee, 0.5));
    if (weapons.includes('scatter')) {
      for (const s of [-1, 1]) {
        group.add(part('stub', [1.25 * s, 1.3], 0x6b5a3a));
        group.add(glowDot([1.25 * s, 1.85], 0xffcc33, 0.5));
      }
    }
    if (weapons.includes('beam')) {
      for (const s of [-1, 1]) {
        group.add(part('rail', [0.7 * s, 2.2], 0x4b4f6e));
        group.add(glowDot([0.7 * s, 3.15], new THREE.Color(0.9, 1.05, 1.8), 0.45));
      }
    }
  }

  // Seeker pods with one missile tip per remaining salvo.
  const seekerTips = [];
  if (weapons.includes('seeker')) {
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xff44ff });
    for (const s of [-1, 1]) {
      group.add(part('launcher', [2.3 * s, -1.0], 0x5a4a5e));
      seekerTips.push(
        [-0.25, 0, 0.25].map((dx) => {
          const t = new THREE.Mesh(missileTipGeo, tipMat);
          t.position.set(2.3 * s + dx, -0.2, 0.65);
          group.add(t);
          return t;
        }),
      );
    }
  }

  // Battle damage: scorch marks, a wing fire and darkened paint.
  const scorchMat = new THREE.MeshBasicMaterial({ color: 0x120e0a, transparent: true, opacity: 0.8, depthWrite: false });
  const scorches = SCORCH_SPOTS.map(([x, y, at], i) => {
    const m = new THREE.Mesh(scorchGeos[i], scorchMat);
    m.position.set(x, y, 0.68); // over the plating and mounts, so damage shows on everything
    m.rotation.z = i * 1.3;
    m.visible = false;
    m.userData.at = at;
    group.add(m);
    return m;
  });
  const fire = glowDot(FIRE_SPOT, new THREE.Color(2.2, 0.9, 0.25), 1.3, 0.7);
  fire.material.transparent = true;
  fire.visible = false;
  group.add(fire);

  let shieldRing = null;
  if (shield) {
    shieldRing = new THREE.Mesh(
      shieldGeo,
      new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    shieldRing.position.z = 0.6;
    shieldRing.visible = false;
    group.add(shieldRing);
  }
  if (scale !== 1) group.scale.setScalar(scale);

  let damage = 0;
  return {
    group,
    flame,
    shieldRing,
    // 0 = pristine, 1 = wrecked.
    setDamage(d) {
      d = Math.max(0, Math.min(1, d));
      if (Math.abs(d - damage) < 0.01) return;
      damage = d;
      for (const s of scorches) s.visible = d >= s.userData.at;
      hullMat.color.copy(baseColor).lerp(SCORCHED, d * 0.6);
      fire.visible = d >= 0.5;
    },
    setSeekerAmmo(n) {
      for (const tips of seekerTips) tips.forEach((t, i) => (t.visible = i < n));
    },
    // Per-frame damage effects: fire flicker, engine sputter, sparks and embers.
    update(dt, particles, x, y) {
      if (fire.visible) {
        fire.material.opacity = 0.6 + Math.random() * 0.4;
        fire.scale.setScalar(1.1 + Math.random() * 0.5);
      }
      if (damage > 0.75 && Math.random() < 0.15) flame.scale.y *= 0.2;
      if (!particles || damage < 0.25) return;
      const s = group.scale.x;
      if (Math.random() < damage * 0.5) {
        const [sx, sy] = SCORCH_SPOTS[Math.floor(Math.random() * SCORCH_SPOTS.length)];
        particles.emit(x + sx * s, y + sy * s, 1, Math.random() < 0.5 ? 0xffd27a : 0xff7a2a, { speed: 14, life: 0.35, drag: 4 });
      }
      if (damage >= 0.5 && Math.random() < 0.6) {
        particles.emit(x + FIRE_SPOT[0] * s, y + FIRE_SPOT[1] * s, 1, 0x8a5a3a, { speed: 6, life: 0.9, angle: -Math.PI / 2, spread: 0.7, drag: 1 });
      }
    },
  };
}

export function createEscortShip(color) {
  return createPlayerShip(color, { shield: false, scale: 0.62 });
}
