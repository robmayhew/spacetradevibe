import * as THREE from 'three';

const geoCache = new Map();
const WHITE = new THREE.Color(0xffffff);

function geometries(key, pts) {
  let g = geoCache.get(key);
  if (!g) {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    g = {
      fill: new THREE.ShapeGeometry(shape),
      line: new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new THREE.Vector3(x, y, 0))),
    };
    geoCache.set(key, g);
  }
  return g;
}

// A glowing outlined polygon: translucent fill + bright outline (bloom does the glow).
// Geometry is cached by key; materials are per-instance so each can flash on hit.
export function neon(key, pts, color, fillOpacity = 0.3) {
  const g = geometries(key, pts);
  const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false });
  const lineMat = new THREE.LineBasicMaterial({ color });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g.fill, fillMat));
  group.add(new THREE.LineLoop(g.line, lineMat));
  // Inset second outline fakes a thicker line.
  const inner = new THREE.LineLoop(g.line, lineMat);
  inner.scale.setScalar(0.9);
  group.add(inner);
  group.userData.neon = { fillMat, lineMat, color: new THREE.Color(color) };
  return group;
}

export function setFlash(group, on) {
  const n = group.userData.neon;
  const c = on ? WHITE : n.color;
  n.lineMat.color.copy(c);
  n.fillMat.color.copy(c);
}

export function disposeNeon(group) {
  const n = group.userData.neon;
  if (!n) return;
  n.fillMat.dispose();
  n.lineMat.dispose();
}

export function regularPolygon(n, r, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

export function starPolygon(n, r1, r2, rot = Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r2 : r1;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

let glowTex = null;
// Soft radial-gradient texture used for nebulae and glows.
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function glowSprite(color, size, opacity = 0.2) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  s.scale.set(size, size, 1);
  return s;
}
