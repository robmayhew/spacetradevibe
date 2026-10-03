import * as THREE from 'three';
import { solid, addLights } from '../fx/model.js';
import { SHAPES } from '../fx/shapes.js';
import { TIERS } from '../galaxy.js';
import { clamp } from '../rng.js';
import { routeDanger } from '../state.js';

export function tierColor(t) {
  const hue = (0.5 - ((t - 1) / (TIERS - 1)) * 0.6 + 1) % 1;
  return new THREE.Color().setHSL(hue, 0.6, 0.5);
}
export function tierCss(t) {
  return '#' + tierColor(t).getHexString();
}

const NODE_R = 3.2;

// Pan/zoomable map of all systems. Rendered through the same WebGL canvas;
// the station screen hands it a DOM element to receive pointer input and host labels.
export class StarMapView {
  constructor(galaxy, pixelRatio) {
    this.galaxy = galaxy;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07080a);
    addLights(this.scene);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.center = new THREE.Vector2();
    this.viewH = 240;
    this.w = this.h = 1;
    this.t = 0;

    const xs = galaxy.systems.map((s) => s.x);
    const ys = galaxy.systems.map((s) => s.y);
    this.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };

    // Faint background dust
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = this.bounds.minX - 150 + Math.random() * (this.bounds.maxX - this.bounds.minX + 300);
      pos[i * 3 + 1] = (Math.random() - 0.5) * 700;
      pos[i * 3 + 2] = -5;
    }
    const dust = new THREE.BufferGeometry();
    dust.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(
      new THREE.Points(dust, new THREE.PointsMaterial({ color: 0x3a3e44, size: 1.5 * pixelRatio, sizeAttenuation: false })),
    );

    // Edges
    this.edges = [];
    for (const s of galaxy.systems) for (const l of s.links) if (l > s.id) this.edges.push([s.id, l]);
    const epos = new Float32Array(this.edges.length * 6);
    this.edges.forEach(([a, b], i) => {
      const A = galaxy.systems[a];
      const B = galaxy.systems[b];
      epos.set([A.x, A.y, -1, B.x, B.y, -1], i * 6);
    });
    const egeo = new THREE.BufferGeometry();
    egeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    this.edgeColors = new THREE.BufferAttribute(new Float32Array(this.edges.length * 6), 3);
    egeo.setAttribute('color', this.edgeColors);
    this.scene.add(new THREE.LineSegments(egeo, new THREE.LineBasicMaterial({ vertexColors: true })));

    // Nodes
    const circle = new THREE.CircleGeometry(NODE_R, 20);
    this.nodes = galaxy.systems.map((s) => {
      let m;
      if (s.terminus) {
        m = solid('terminus', SHAPES.terminus, 0xd9b45a, { depth: 1.5 });
      } else {
        m = new THREE.Mesh(circle, new THREE.MeshBasicMaterial({ color: tierColor(s.tier) }));
      }
      m.position.set(s.x, s.y, 0);
      this.scene.add(m);
      return m;
    });

    const ring = (r1, r2, color) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(r1, r2, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true }),
      );
      this.scene.add(m);
      return m;
    };
    this.currentRing = ring(5, 5.8, 0xffffff);
    this.selectRing = ring(7, 7.6, 0xf2a541);
    this.contractRings = [0, 1, 2].map(() => ring(5, 5.5, 0xf2a541));

    this.labels = new Map();
  }

  refresh({ state, rating, selected }) {
    this.state = state;
    this.rating = rating;
    this.selected = selected;
    const visited = new Set(state.visited);
    const sys = this.galaxy.systems;
    sys.forEach((s, i) => {
      if (s.terminus) return;
      const c = tierColor(s.tier);
      if (!visited.has(i)) c.multiplyScalar(0.35);
      this.nodes[i].material.color.copy(c);
    });
    const col = this.edgeColors.array;
    this.edges.forEach(([a, b], i) => {
      const d = Math.max(sys[a].tier, sys[b].tier);
      const c = tierColor(d);
      const fromHere = a === state.current || b === state.current;
      c.multiplyScalar(fromHere ? 1 : visited.has(a) && visited.has(b) ? 0.45 : 0.18);
      col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    });
    this.edgeColors.needsUpdate = true;

    const here = sys[state.current];
    this.currentRing.position.set(here.x, here.y, 0.5);
    this.contractRings.forEach((r, i) => {
      const c = state.contracts[i];
      r.visible = !!c;
      if (!c) return;
      const d = sys[c.dest];
      r.position.set(d.x, d.y, 0.5);
      r.material.color.set(routeDanger(c.difficulty, rating).color);
    });
    const sel = selected != null ? sys[selected] : null;
    this.selectRing.visible = !!sel;
    if (sel) this.selectRing.position.set(sel.x, sel.y, 0.5);
    this.rebuildLabels();
  }

  focus(id) {
    const s = this.galaxy.systems[id];
    this.center.set(s.x, s.y);
    this.updateCamera();
  }

  zoomToFit() {
    const b = this.bounds;
    const aspect = this.w / this.h;
    this.center.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    this.viewH = Math.max((b.maxY - b.minY) * 1.15, ((b.maxX - b.minX) * 1.08) / aspect);
    this.updateCamera();
  }

  updateCamera() {
    const aspect = this.w / this.h;
    const b = this.bounds;
    this.viewH = clamp(this.viewH, 60, 1400);
    this.center.x = clamp(this.center.x, b.minX - 60, b.maxX + 60);
    this.center.y = clamp(this.center.y, b.minY - 60, b.maxY + 60);
    const hh = this.viewH / 2;
    const hw = hh * aspect;
    Object.assign(this.camera, {
      left: this.center.x - hw,
      right: this.center.x + hw,
      top: this.center.y + hh,
      bottom: this.center.y - hh,
    });
    this.camera.updateProjectionMatrix();
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.updateCamera();
  }

  screenToWorld(sx, sy) {
    const hh = this.viewH / 2;
    const hw = hh * (this.w / this.h);
    return { x: this.center.x - hw + (sx / this.w) * hw * 2, y: this.center.y + hh - (sy / this.h) * hh * 2 };
  }

  worldToScreen(x, y) {
    const hh = this.viewH / 2;
    const hw = hh * (this.w / this.h);
    return { x: ((x - this.center.x + hw) / (hw * 2)) * this.w, y: ((this.center.y + hh - y) / (hh * 2)) * this.h };
  }

  pick(sx, sy) {
    let best = null;
    let bestD = 16;
    for (const s of this.galaxy.systems) {
      const p = this.worldToScreen(s.x, s.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  // el: element covering the map area (receives pointer events); labelsEl: fixed full-screen layer.
  attach(el, labelsEl, { onHover, onSelect }) {
    this.detach();
    this.labelsEl = labelsEl;
    this.rebuildLabels();
    let drag = null;
    const onDown = (e) => {
      drag = { x: e.clientX, y: e.clientY, cx: this.center.x, cy: this.center.y, moved: false };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        const scale = this.viewH / this.h;
        this.center.set(drag.cx - dx * scale, drag.cy + dy * scale);
        this.updateCamera();
      }
      const hit = this.pick(e.clientX, e.clientY);
      if (hit?.id !== this.hovered?.id) {
        this.hovered = hit;
        this.rebuildLabels();
        onHover(hit, e);
      }
      el.style.cursor = drag?.moved ? 'grabbing' : hit ? 'pointer' : 'grab';
    };
    const onUp = (e) => {
      if (drag && !drag.moved) {
        const hit = this.pick(e.clientX, e.clientY);
        if (hit) onSelect(hit);
      }
      drag = null;
    };
    const onWheel = (e) => {
      e.preventDefault();
      const before = this.screenToWorld(e.clientX, e.clientY);
      this.viewH *= Math.exp(e.deltaY * 0.0015);
      this.updateCamera();
      const after = this.screenToWorld(e.clientX, e.clientY);
      this.center.x += before.x - after.x;
      this.center.y += before.y - after.y;
      this.updateCamera();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    this.detachFn = () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }

  detach() {
    this.detachFn?.();
    this.detachFn = null;
    this.labelsEl = null;
    this.labels.clear();
    this.hovered = null;
  }

  rebuildLabels() {
    if (!this.labelsEl || !this.state) return;
    const ids = new Set([this.state.current, this.galaxy.end, ...this.state.contracts.map((c) => c.dest)]);
    if (this.hovered) ids.add(this.hovered.id);
    this.labelsEl.innerHTML = '';
    this.labels.clear();
    for (const id of ids) {
      const s = this.galaxy.systems[id];
      const div = document.createElement('div');
      div.className = 'map-label' + (id === this.state.current ? ' current' : '') + (s.terminus ? ' terminus' : '');
      div.textContent = id === this.state.current ? `${s.name} (you)` : s.name;
      this.labelsEl.appendChild(div);
      this.labels.set(id, div);
    }
  }

  update(dt) {
    this.t += dt;
    const pulse = 1 + Math.sin(this.t * 4) * 0.12;
    this.currentRing.scale.setScalar(pulse);
    this.selectRing.rotation.z += dt;
    this.nodes[this.galaxy.end].rotation.z += dt * 0.4;
    for (const [id, div] of this.labels) {
      const s = this.galaxy.systems[id];
      const p = this.worldToScreen(s.x, s.y);
      div.style.transform = `translate(${p.x}px, ${p.y + 12}px) translateX(-50%)`;
    }
  }
}
