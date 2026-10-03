import * as THREE from 'three';
import { RNG } from '../rng.js';

// Low-poly solid models: 2D outlines extruded into chamfered, flat-shaded hulls.
// Per-face brightness jitter and dark panel edges give a weathered, gritty look.

const geoCache = new Map();
const edgeMat = new THREE.LineBasicMaterial({ color: 0x0b0c0e, transparent: true, opacity: 0.55 });
const BLACK = new THREE.Color(0x000000);
const FLASH = new THREE.Color(0xffffff);

function radiusOf(pts) {
  return Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
}

// Darken each triangle by a random amount so surfaces read as worn panels.
function addGrit(geo, seed, grit) {
  const rng = new RNG(seed);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const f = 1 - grit * rng.next() - (rng.chance(0.06) ? 0.25 : 0); // occasional scorched panel
    for (let k = 0; k < 9; k++) col[i * 3 + k] = f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function hashKey(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

function extruded(key, pts, depth) {
  const cacheKey = `${key}|${depth}`;
  let g = geoCache.get(cacheKey);
  if (!g) {
    const r = radiusOf(pts);
    const bevel = Math.min(0.45, r * 0.1);
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    let body = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 3,
    });
    body.translate(0, 0, -depth - bevel); // top face sits at z = 0
    if (body.index) body = body.toNonIndexed();
    addGrit(body, hashKey(key), 0.22);
    g = { body, edges: new THREE.EdgesGeometry(body, 25) };
    geoCache.set(cacheKey, g);
  }
  return g;
}

function hullMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.15 });
}

// A solid hull. `glass` adds a translucent canopy (outline points) on top.
export function solid(key, pts, color, { depth, glass, glassColor = 0x8fdcff, edges = true } = {}) {
  const d = depth ?? Math.min(2.5, Math.max(0.5, radiusOf(pts) * 0.3));
  const g = extruded(key, pts, d);
  const mat = hullMaterial(color);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g.body, mat));
  if (edges) group.add(new THREE.LineSegments(g.edges, edgeMat));
  const mats = [mat];
  const extra = [];
  if (glass) {
    const gg = extruded(`${key}:glass`, glass, 0.15);
    const gm = new THREE.MeshStandardMaterial({
      color: glassColor, emissive: glassColor, emissiveIntensity: 0.25, transparent: true, opacity: 0.55,
      roughness: 0.15, metalness: 0, flatShading: true,
    });
    extra.push(gm);
    const canopy = new THREE.Mesh(gg.body, gm);
    canopy.position.z = 0.35;
    group.add(canopy);
  }
  group.userData.model = { mats, extra };
  return group;
}

const rockCache = new Map();
// Tumbling low-poly rock (a jittered icosahedron).
export function rock(variant, color) {
  let geo = rockCache.get(variant);
  if (!geo) {
    const rng = new RNG(4242 + variant);
    geo = new THREE.IcosahedronGeometry(3, 0);
    const p = geo.attributes.position;
    // Move shared corners together so faces stay closed.
    const offsets = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!offsets.has(k)) offsets.set(k, rng.float(0.7, 1.15));
      const f = offsets.get(k);
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f * 0.8);
    }
    addGrit(geo, 99 + variant, 0.3);
    rockCache.set(variant, geo);
  }
  const mat = hullMaterial(color);
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.model = { mats: [mat] };
  group.userData.rock = mesh;
  return group;
}

// Unlit, bright flat shape for projectiles and markings (these are what bloom picks up).
const flatCache = new Map();
export function flatShape(key, pts, color) {
  let geo = flatCache.get(key);
  if (!geo) {
    geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
    flatCache.set(key, geo);
  }
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
}

export function setFlash(group, on) {
  for (const m of group.userData.model.mats) {
    m.emissive.copy(on ? FLASH : BLACK);
    m.emissiveIntensity = on ? 0.9 : 1;
  }
}

export function disposeModel(obj) {
  const model = obj.userData.model;
  if (!model) return;
  for (const m of [...model.mats, ...(model.extra || [])]) m.dispose();
}

// Standard key + fill lighting used by every scene with solid models.
export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xb8c4d0, 0x2a2018, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
  sun.position.set(-40, 55, 80);
  scene.add(sun);
}
