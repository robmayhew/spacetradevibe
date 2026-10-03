import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { solid, rock, addLights, disposeModel } from '../fx/model.js';
import { SHAPES, GLASS, ASTEROID_VARIANTS } from '../fx/shapes.js';
import { ESCORT_COLORS, createPlayerShip, createEscortShip } from '../fx/ship.js';
import { ENEMIES } from '../data.js';
import { clamp } from '../rng.js';

const TOP = 50;
const BOTTOM = -50;
const MAX_PLAY_HALF_W = 70;
const circleGeo = new THREE.CircleGeometry(0.7, 10);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function byId(list) {
  const m = new Map();
  for (const row of list || []) m.set(row.i, row);
  return m;
}

export class EscortArena {
  constructor(root) {
    this.root = root;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(this.pixelRatio);
    root.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07080a);
    addLights(this.scene);
    this.camera = new THREE.OrthographicCamera(-50, 50, TOP, BOTTOM, -10, 10);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.pixelRatio);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.72);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.captain = createPlayerShip();
    this.scene.add(this.captain.group);
    this.beam = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.45 }),
    );
    this.beam.visible = false;
    this.scene.add(this.beam);

    this.escorts = new Map();
    this.enemies = new Map();
    this.shots = new Map();
    this.own = { x: 0, y: -20 };
    this.ownId = null;
    this.speed = 40;
    this.paused = false;
    this.halfW = 50;
    this.from = null;
    this.to = null;
    this.gotAt = 0;
    this.input = { mx: 0, my: 0 };
    this.seated = false;
    this.alive = true;
    this.last = performance.now();
    this.resize();
    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(this.loop);
  }

  onResize = () => this.resize();

  resize() {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.applyCamera();
  }

  applyCamera() {
    this.camera.left = -this.halfW;
    this.camera.right = this.halfW;
    this.camera.top = TOP;
    this.camera.bottom = BOTTOM;
    this.camera.updateProjectionMatrix();
  }

  setInput(mx, my) {
    this.input.mx = mx;
    this.input.my = my;
  }

  applyFrame(frame, ownId) {
    if (!frame) return;
    this.from = this.to || frame;
    this.to = frame;
    this.gotAt = performance.now();
    this.ownId = ownId;
    this.speed = frame.s || this.speed;
    this.paused = !!frame.z;
    if (typeof frame.w === 'number' && frame.w > 8) {
      this.halfW = frame.w;
      this.applyCamera();
    }
    const me = (frame.es || []).find((e) => e.i === ownId);
    if (me && (me.r > 0 || !this.seated)) {
      this.own.x = me.x;
      this.own.y = me.y;
      if (me.r <= 0) this.seated = true;
    }
  }

  loop = (now) => {
    if (!this.alive) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.composer.render();
    requestAnimationFrame(this.loop);
  };

  update(dt) {
    const cur = this.to;
    if (!cur) return;
    const u = this.paused ? 1 : Math.min(1, (performance.now() - this.gotAt) / 100);
    const playW = Math.min(this.halfW, MAX_PLAY_HALF_W) - 3;
    const cap = mixRow(this.from?.cap, cur.cap, u);
    this.captain.group.position.set(cap.x, cap.y, 0);
    const sh = cap.sh || 0;
    if (this.captain.shieldRing) {
      this.captain.shieldRing.visible = sh > 0.5;
      this.captain.shieldRing.material.opacity = 0.15 + 0.35 * (sh / (cap.sm || 1));
    }

    const fromEs = byId(this.from?.es);
    const seenEs = new Set();
    for (const row of cur.es || []) {
      seenEs.add(row.i);
      let h = this.escorts.get(row.i);
      if (!h) {
        const color = ESCORT_COLORS[row.c] ?? ESCORT_COLORS[0];
        const ship = createEscortShip(color);
        this.scene.add(ship.group);
        h = { mesh: ship.group, flame: ship.flame, x: row.x, y: row.y };
        this.escorts.set(row.i, h);
      }
      const prev = fromEs.get(row.i) || row;
      const x = lerp(prev.x, row.x, u);
      const y = lerp(prev.y, row.y, u);
      if (row.i === this.ownId) {
        if (row.r > 0) {
          this.own.x = row.x;
          this.own.y = row.y;
          h.mesh.visible = false;
        } else {
          if (!this.paused) {
            const mx = this.input.mx;
            const my = this.input.my;
            const len = Math.hypot(mx, my) || 1;
            this.own.x = clamp(this.own.x + (mx / len) * this.speed * dt, -playW, playW);
            this.own.y = clamp(this.own.y + (my / len) * this.speed * dt, BOTTOM + 5, TOP - 12);
          }
          const k = 1 - Math.exp(-10 * dt);
          this.own.x = lerp(this.own.x, x, k);
          this.own.y = lerp(this.own.y, y, k);
          h.mesh.position.set(this.own.x, this.own.y, 0);
          h.mesh.visible = true;
        }
      } else {
        h.mesh.position.set(x, y, 0);
        h.mesh.visible = row.r <= 0;
      }
    }
    for (const [id, h] of [...this.escorts]) {
      if (seenEs.has(id)) continue;
      this.scene.remove(h.mesh);
      disposeModel(h.mesh);
      this.escorts.delete(id);
    }

    const fromEn = byId(this.from?.en);
    const seenEn = new Set();
    for (const row of cur.en || []) {
      seenEn.add(row.i);
      let e = this.enemies.get(row.i);
      if (!e) {
        e = { mesh: this.makeEnemy(row) };
        this.scene.add(e.mesh);
        this.enemies.set(row.i, e);
      }
      const prev = fromEn.get(row.i) || row;
      e.mesh.position.set(lerp(prev.x, row.x, u), lerp(prev.y, row.y, u), 0);
    }
    for (const [id, e] of [...this.enemies]) {
      if (seenEn.has(id)) continue;
      this.scene.remove(e.mesh);
      disposeModel(e.mesh);
      this.enemies.delete(id);
    }

    const fromSh = byId(this.from?.sh);
    const seenSh = new Set();
    const age = this.paused ? 0 : (performance.now() - this.gotAt) / 1000;
    for (const row of cur.sh || []) {
      seenSh.add(row.i);
      let s = this.shots.get(row.i);
      if (!s) {
        const mat = new THREE.MeshBasicMaterial({ color: row.c || (row.k ? 0xff5533 : 0x33ffee) });
        s = { mesh: new THREE.Mesh(circleGeo, mat) };
        s.mesh.scale.setScalar((row.r || 0.7) / 0.7);
        this.scene.add(s.mesh);
        this.shots.set(row.i, s);
      }
      const prev = fromSh.get(row.i);
      const x = prev ? lerp(prev.x, row.x, u) : row.x;
      const y = prev ? lerp(prev.y, row.y, u) : row.y;
      s.mesh.position.set(x + (row.vx || 0) * age * 0.15, y + (row.vy || 0) * age * 0.15, 0.1);
    }
    for (const [id, s] of [...this.shots]) {
      if (seenSh.has(id)) continue;
      this.scene.remove(s.mesh);
      s.mesh.material.dispose();
      this.shots.delete(id);
    }

    if (cur.b) {
      this.beam.visible = true;
      this.beam.position.set(cur.b.x, cur.b.y, 0.2);
      this.beam.scale.set(1.2, Math.max(0.1, cur.b.h), 1);
    } else {
      this.beam.visible = false;
    }
  }

  makeEnemy(row) {
    const type = row.t;
    const def = ENEMIES[type];
    const color = def?.color ?? 0x888888;
    let mesh;
    if (type === 'asteroid') {
      mesh = rock(Math.abs(row.i) % ASTEROID_VARIANTS, color);
    } else {
      mesh = solid(type, SHAPES[type] || SHAPES.scout, color, { glass: GLASS[type] });
    }
    const sc = row.sc || 1;
    mesh.scale.setScalar(sc);
    return mesh;
  }

  dispose() {
    this.alive = false;
    window.removeEventListener('resize', this.onResize);
    for (const h of this.escorts.values()) {
      this.scene.remove(h.mesh);
      disposeModel(h.mesh);
    }
    for (const e of this.enemies.values()) {
      this.scene.remove(e.mesh);
      disposeModel(e.mesh);
    }
    for (const s of this.shots.values()) {
      this.scene.remove(s.mesh);
      s.mesh.material.dispose();
    }
    this.scene.remove(this.captain.group);
    disposeModel(this.captain.group);
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function mixRow(a, b, u) {
  if (!b) return { x: 0, y: 0 };
  if (!a) return b;
  return {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    sh: lerp(a.sh || 0, b.sh || 0, u),
    sm: b.sm,
  };
}
