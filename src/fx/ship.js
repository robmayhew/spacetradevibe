import * as THREE from 'three';
import { solid } from './model.js';
import { SHAPES, GLASS } from './shapes.js';
import { RNG } from '../rng.js';
import { SHIPS } from '../data.js';
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

function hullParts(shipId) {
  const def = SHIPS[shipId] || SHIPS.hauler;
  const shape = def.shape || 'player';
  return {
    def,
    shape,
    pts: SHAPES[shape] || SHAPES.player,
    glass: GLASS[shape] || GLASS.player,
  };
}

// Part and damage spots are laid out on the original hull (x ±3.2, y -3.2…4).
// fitTo() maps them onto another hull by its own width and length.
function fitTo(pts) {
  const xs = pts.map(([x]) => Math.abs(x));
  const ys = pts.map(([, y]) => y);
  const half = Math.max(...xs);
  const top = Math.max(...ys);
  const bottom = Math.min(...ys);
  const sx = half / 3.2;
  const sy = (top - bottom) / 7.2;
  return ([x, y]) => [x * sx, bottom + (y + 3.2) * sy];
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

// The player's ship: the chosen hull (`ship`), plus — with a `loadout` ({ upgrades, weapons }) —
// what's installed on it. Without a loadout (escorts, menu) it's the bare hull.
export function createPlayerShip(color, { shield = true, scale = 1, ship = 'hauler', loadout = null } = {}) {
  const { def, shape, pts, glass } = hullParts(ship);
  const col = color ?? def.color ?? PLAYER_COLOR;
  const at = fitTo(pts);
  const group = new THREE.Group();
  const hull = solid(shape, pts, col, { depth: 1, glass });
  group.add(hull);
  const hullMat = hull.userData.model.mats[0];
  const baseColor = new THREE.Color(col);
  const flameY = def.flameY ?? -2.8;
  const u = loadout?.upgrades ?? {};
  const weapons = loadout?.weapons ?? [];

  // Engines: more and bigger nozzles; hot blue-white flames from level 5.
  const engine = u.engine ?? 1;
  const nozzleXs = engine >= 5 ? [-0.8, 0, 0.8] : engine >= 3 ? [-0.6, 0.6] : [0];
  const flame = new THREE.Group();
  flame.position.set(0, flameY - 0.2, 0.3);
  const flameMat = new THREE.MeshBasicMaterial({ color: engine >= 5 ? 0x9fd0ff : 0xff9933, transparent: true, opacity: 0.9 });
  const flameSize = (nozzleXs.length > 1 ? 0.65 : 1) * (0.85 + 0.06 * engine);
  for (const x of nozzleXs) {
    if (loadout) group.add(part('nozzle', [at([x, 0])[0], flameY + 0.25], 0x4a4f57, { depth: 0.25, z: 0.25 }));
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.x = at([x, 0])[0];
    f.scale.setScalar(flameSize);
    flame.add(f);
  }
  group.add(flame);

  if (loadout) {
    // Hull plating: armor plates at levels 3, 5, 7, 9.
    const plates = Math.min(4, Math.floor(((u.hull ?? 1) - 1) / 2));
    for (let i = 0; i < plates; i++) {
      for (const s of [-1, 1]) group.add(part('plate', at([PLATE_SPOTS[i][0] * s, PLATE_SPOTS[i][1]]), 0xa9b3bf));
    }
    // Shields: wingtip emitters, brighter with level (over 1.0 so bloom makes them glow).
    if ((u.shield ?? 0) > 0) {
      const c = new THREE.Color(0.35, 0.66, 1).multiplyScalar(0.6 + 0.12 * u.shield);
      // On the hull's actual wingtips.
      const tip = pts.reduce((a, b) => (Math.abs(b[0]) > Math.abs(a[0]) ? b : a));
      for (const s of [-1, 1]) group.add(glowDot([Math.abs(tip[0]) * 0.92 * s, tip[1]], c, 0.8 + 0.04 * u.shield));
    }
    // Weapons Core: a power line down the spine.
    if ((u.core ?? 1) >= 2) {
      const spine = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2, 2.0),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.22).multiplyScalar(0.3 + 0.17 * u.core) }),
      );
      spine.position.set(0, at([0, -1.0])[1], 0.32);
      group.add(spine);
    }
    // Cargo Hold: up to four pods behind the canopy.
    const pods = Math.min(4, Math.floor((u.cargo ?? 1) / 2.5));
    for (let i = 0; i < pods; i++) group.add(part('pod', at(POD_SPOTS[i]), 0x8a6a3e, { depth: 0.45 }));
    // Weapon mounts. The nose gun sits on the hull's tip.
    const nose = Math.max(...pts.map(([, y]) => y));
    group.add(part('barrel', [0, nose + 0.1], 0x3b3f45));
    group.add(glowDot([0, nose + 0.7], 0x33ffee, 0.5));
    if (weapons.includes('scatter')) {
      for (const s of [-1, 1]) {
        group.add(part('stub', at([1.25 * s, 1.3]), 0x6b5a3a));
        group.add(glowDot(at([1.25 * s, 1.85]), 0xffcc33, 0.5));
      }
    }
    if (weapons.includes('beam')) {
      for (const s of [-1, 1]) {
        group.add(part('rail', at([0.7 * s, 2.2]), 0x4b4f6e));
        group.add(glowDot(at([0.7 * s, 3.15]), new THREE.Color(0.9, 1.05, 1.8), 0.45));
      }
    }
  }

  // Seeker pods with one missile tip per remaining salvo.
  const seekerTips = [];
  if (weapons.includes('seeker')) {
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xff44ff });
    for (const s of [-1, 1]) {
      const [lx, ly] = at([2.3 * s, -1.0]);
      group.add(part('launcher', [lx, ly], 0x5a4a5e));
      seekerTips.push(
        [-0.25, 0, 0.25].map((dx) => {
          const t = new THREE.Mesh(missileTipGeo, tipMat);
          t.position.set(lx + dx, ly + 0.8, 0.65);
          group.add(t);
          return t;
        }),
      );
    }
  }

  // Battle damage: scorch marks, a wing fire and darkened paint.
  const scorchMat = new THREE.MeshBasicMaterial({ color: 0x120e0a, transparent: true, opacity: 0.8, depthWrite: false });
  const scorches = SCORCH_SPOTS.map(([x, y, showAt], i) => {
    const m = new THREE.Mesh(scorchGeos[i], scorchMat);
    const [fx, fy] = at([x, y]);
    m.position.set(fx, fy, 0.68); // over the plating and mounts, so damage shows on everything
    m.rotation.z = i * 1.3;
    m.visible = false;
    m.userData.at = showAt;
    group.add(m);
    return m;
  });
  const fireAt = at(FIRE_SPOT);
  const fire = glowDot(fireAt, new THREE.Color(2.2, 0.9, 0.25), 1.3, 0.7);
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
    ship,
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
        const [sx, sy] = at(SCORCH_SPOTS[Math.floor(Math.random() * SCORCH_SPOTS.length)]);
        particles.emit(x + sx * s, y + sy * s, 1, Math.random() < 0.5 ? 0xffd27a : 0xff7a2a, { speed: 14, life: 0.35, drag: 4 });
      }
      if (damage >= 0.5 && Math.random() < 0.6) {
        particles.emit(x + fireAt[0] * s, y + fireAt[1] * s, 1, 0x8a5a3a, { speed: 6, life: 0.9, angle: -Math.PI / 2, spread: 0.7, drag: 1 });
      }
    },
  };
}

export function createEscortShip(color) {
  return createPlayerShip(color, { shield: false, scale: 0.62 });
}
