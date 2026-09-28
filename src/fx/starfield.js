import * as THREE from 'three';

const LAYERS = [
  { count: 260, speed: 0.25, size: 1, bright: 0.22 },
  { count: 140, speed: 0.55, size: 1.4, bright: 0.34 },
  { count: 50, speed: 1, size: 2, bright: 0.5 },
];

// Parallax starfield that scrolls downward (the ship "flies up").
export class Starfield {
  constructor(scene, pixelRatio = 1, width = 420, height = 120) {
    this.width = width;
    this.height = height;
    this.layers = LAYERS.map((L) => {
      const pos = new Float32Array(L.count * 3);
      const col = new Float32Array(L.count * 3);
      for (let i = 0; i < L.count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * width;
        pos[i * 3 + 1] = (Math.random() - 0.5) * height;
        pos[i * 3 + 2] = -5;
        const tint = Math.random();
        const b = L.bright * (0.6 + Math.random() * 0.4);
        col[i * 3] = b * (tint < 0.2 ? 1 : 0.8);
        col[i * 3 + 1] = b * 0.85;
        col[i * 3 + 2] = b * (tint > 0.8 ? 0.7 : 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ size: L.size * pixelRatio, sizeAttenuation: false, vertexColors: true }),
      );
      pts.frustumCulled = false;
      scene.add(pts);
      return { ...L, pos, pts };
    });
  }

  update(dt, speed) {
    const half = this.height / 2;
    for (const L of this.layers) {
      const p = L.pos;
      const dy = speed * L.speed * dt;
      for (let i = 1; i < p.length; i += 3) {
        p[i] -= dy;
        if (p[i] < -half) p[i] += this.height;
      }
      L.pts.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    for (const L of this.layers) {
      L.pts.geometry.dispose();
      L.pts.material.dispose();
    }
  }
}
