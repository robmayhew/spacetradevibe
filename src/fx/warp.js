import * as THREE from 'three';

// Faint light streaks rushing past during travel: you're at warp, the only place
// the KL9 can reach you (see design/story.md).
export class WarpStreaks {
  constructor(scene, count = 70, width = 260, height = 130) {
    this.width = width;
    this.height = height;
    this.items = Array.from({ length: count }, () => this.spawn({}, true));
    this.pos = new Float32Array(count * 6);
    const col = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const b = 0.25 + Math.random() * 0.3;
      col.set([b * 0.75, b * 0.85, b, 0, 0, 0], i * 6); // bright head, fading tail
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  spawn(s, anywhere = false) {
    s.x = (Math.random() - 0.5) * this.width;
    s.y = anywhere ? (Math.random() - 0.5) * this.height : this.height / 2 + Math.random() * 20;
    s.len = 4 + Math.random() * 10;
    s.speed = 110 + Math.random() * 120;
    return s;
  }

  update(dt, boost = 1) {
    this.items.forEach((s, i) => {
      s.y -= s.speed * boost * dt;
      if (s.y + s.len < -this.height / 2) this.spawn(s);
      const len = s.len * Math.min(4, boost);
      this.pos.set([s.x, s.y, -4, s.x, s.y + len, -4], i * 6);
    });
    this.posAttr.needsUpdate = true;
  }

  dispose() {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
