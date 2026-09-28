import * as THREE from 'three';

const tmp = new THREE.Color();

// Ring-buffer particle pool rendered as one additive Points object.
// Particles fade by darkening toward black, which is invisible under additive blending.
export class Particles {
  constructor(scene, pixelRatio = 1, max = 4000) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 2);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = 9999;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 3 * pixelRatio,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.position.z = 1;
    scene.add(this.points);
  }

  emit(x, y, count, color, { speed = 25, life = 0.7, angle = 0, spread = Math.PI * 2, drag = 2.5, vx = 0, vy = 0 } = {}) {
    tmp.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.25 + Math.random() * 0.75);
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.vel[i * 2] = Math.cos(a) * s + vx;
      this.vel[i * 2 + 1] = Math.sin(a) * s + vy;
      this.life[i] = this.maxLife[i] = life * (0.5 + Math.random() * 0.5);
      this.drag[i] = drag;
      this.base[i * 3] = tmp.r;
      this.base[i * 3 + 1] = tmp.g;
      this.base[i * 3 + 2] = tmp.b;
    }
  }

  explode(x, y, color, size = 1) {
    this.emit(x, y, Math.round(18 * size), color, { speed: 30 * Math.sqrt(size), life: 0.8 });
    this.emit(x, y, Math.round(8 * size), 0xffffff, { speed: 18 * Math.sqrt(size), life: 0.45 });
  }

  update(dt) {
    const { pos, vel, col, base, life, maxLife, drag } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
        pos[i * 3 + 1] = 9999;
        continue;
      }
      const k = Math.max(0, 1 - drag[i] * dt);
      vel[i * 2] *= k;
      vel[i * 2 + 1] *= k;
      pos[i * 3] += vel[i * 2] * dt;
      pos[i * 3 + 1] += vel[i * 2 + 1] * dt;
      const f = life[i] / maxLife[i];
      col[i * 3] = base[i * 3] * f;
      col[i * 3 + 1] = base[i * 3 + 1] * f;
      col[i * 3 + 2] = base[i * 3 + 2] * f;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
