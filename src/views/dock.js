import * as THREE from 'three';
import { Starfield } from '../fx/starfield.js';
import { Particles } from '../fx/particles.js';
import { regularPolygon, glowSprite } from '../fx/geom.js';
import { solid, disposeModel, addLights } from '../fx/model.js';
import { SHAPES, GLASS } from '../fx/shapes.js';
import { createPlayerShip } from '../fx/ship.js';
import { textSprite } from '../fx/text.js';
import { tierColor } from './starmap.js';
import { shipStats } from '../state.js';
import { DockHUD } from '../ui/dockhud.js';
import { RNG, rand, clamp, pick, weightedPick } from '../rng.js';

const TOP = 50;
const BOTTOM = -50;
const MAX_PLAY_HALF_W = 75;
const PLAYER_R = 1.3;
const PAD_R = 4.5;
const LAND_RADIUS = PAD_R - 1.5; // ship center must be this close to the pad center
const LAND_TIME = 1.5;
const LAND_MAX_SPEED = 12;
const BUMP_DAMAGE = 0.04; // fraction of max hull per bump
const BUMP_MIN_SPEED = 4;
const ARM_HALF_W = 0.8;
const GATE_HALF_W = 8;
const GATE_Y = 41;
const STATION_SPIN_BASE = 0.06; // rad/s at tier 1; every station rotates
const STATION_SPIN_PER_TIER = 0.012; // tier 10 ≈ 0.17 rad/s

const NPC_TYPES = {
  shuttle: { r: 1.5, speed: [16, 24], weight: 3 },
  tug: { r: 2, speed: [11, 16], weight: 2 },
  freighter: { r: 3, speed: [7, 11], weight: 1.5 },
};
const NPC_COLORS = [0x9a7b4f, 0x7d8c99, 0x8f5f4f, 0x6f7f6a, 0xa09a8a];
const STEEL = 0x6b7078;
const ASSIGNED = 0xf2a541;
const ASSIGNED_CSS = '#f2a541';

const circleGeo = new THREE.CircleGeometry(0.45, 10);
const markingGeo = new THREE.RingGeometry(PAD_R - 0.75, PAD_R - 0.35, 24);
const segGeos = Array.from({ length: 24 }, (_, i) =>
  new THREE.RingGeometry(PAD_R + 0.7, PAD_R + 1.3, 3, 1, (i / 24) * Math.PI * 2 + Math.PI / 2, (Math.PI * 2) / 24 - 0.04),
);

// Each station's look and busyness is fixed per system (seeded), and grows with tier:
// more pads, more traffic, and faster rotation.
export function stationLayout(galaxySeed, system) {
  const rng = new RNG((galaxySeed ^ Math.imul(system.id + 1, 2654435761)) >>> 0);
  const flip = rng.chance(0.5) ? 1 : -1;
  return {
    padCount: Math.min(6, 3 + Math.floor(system.tier / 3) + rng.int(0, 1)),
    hubR: rng.float(8, 11),
    armLen: rng.float(26, 30),
    offset: rng.float(0, Math.PI * 2),
    hubY: rng.float(0, 6),
    spin: (STATION_SPIN_BASE + STATION_SPIN_PER_TIER * (system.tier - 1)) * flip,
    traffic: Math.min(8, 2 + Math.round(system.tier * 0.6)),
    drones: 3 + rng.int(0, 2),
    gateX: rng.float(-30, 30),
    planet: { x: rng.float(55, 80) * (rng.chance(0.5) ? 1 : -1), y: rng.float(-35, 25), r: rng.float(18, 30), hue: rng.next() },
    color: tierColor(system.tier),
  };
}

export class DockView {
  constructor(app, { mode, system, galaxy, state, hull, onDone }) {
    this.app = app;
    this.audio = app.audio;
    this.input = app.input;
    this.mode = mode;
    this.onDone = onDone;
    this.L = stationLayout(galaxy.seed, system);
    this.stats = shipStats(state);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07080a);
    addLights(this.scene);
    this.camera = new THREE.OrthographicCamera(-50, 50, TOP, BOTTOM, -10, 10);
    this.resize(app.w, app.h); // traffic spawning below needs the screen width
    this.stars = new Starfield(this.scene, app.pixelRatio);
    this.particles = new Particles(this.scene, app.pixelRatio, 2000);

    this.t = 0;
    this.rot = 0;
    this.shake = 0;
    this.bumps = 0;
    this.bumpCd = 0;
    this.time = 0;
    this.progress = 0;
    this.beepT = 0;
    this.paused = false;
    this.done = false;
    this.npcs = [];
    this.spawnCd = 1;
    this.hint = '';

    this.buildBackground();
    this.buildStation();

    // Assign a pad; in dock mode other traffic may already occupy the rest.
    this.target = pick(this.pads);
    this.target.assigned = true;
    this.styleAssignedPad();

    const ship = createPlayerShip(undefined, { loadout: { upgrades: state.upgrades, weapons: state.weapons } });
    this.ship = ship;
    this.scene.add(ship.group);
    this.player = { x: 0, y: -58, vx: 0, vy: 0, hull: hull, maxHull: this.stats.maxHull, attached: false };

    const guideGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.guide = new THREE.Line(guideGeo, new THREE.LineBasicMaterial({ color: ASSIGNED, transparent: true, opacity: 0.3 }));
    this.scene.add(this.guide);

    if (mode === 'undock') this.buildGate();

    // Start with a lived-in station: some visitors already docked, one ship passing.
    for (let i = 0; i < Math.floor(this.L.traffic / 2); i++) this.spawnVisitor(true);
    this.spawnTransit(true);

    this.hud = new DockHUD(app.hud, {
      mode, station: system.name, pad: this.target.num,
      onResume: () => this.setPaused(false),
    });
    if (mode === 'dock') {
      this.setPhase('arrive');
      this.hud.banner(`Welcome to ${system.name}`, `Proceed to Pad ${this.target.num}`);
    } else {
      this.player.attached = true;
      this.setPhase('clearance');
      this.hud.banner('Clearance granted', `Depart via the gate. Watch the traffic.`);
    }
    this.input.captureKeys = true;
    document.activeElement?.blur?.();
  }

  // ---------------------------------------------------------------- construction

  buildBackground() {
    const P = this.L.planet;
    const pc = new THREE.Color().setHSL(P.hue, 0.3, 0.2);
    const planet = new THREE.Mesh(
      new THREE.IcosahedronGeometry(P.r, 1),
      new THREE.MeshStandardMaterial({ color: pc, flatShading: true, roughness: 1, metalness: 0 }),
    );
    planet.scale.z = 0.15; // keep it inside the camera's depth range
    planet.position.set(P.x, P.y, -7);
    this.scene.add(planet);
    this.planet = planet;
    const glow = glowSprite(pc, P.r * 2.8, 0.1);
    glow.position.set(P.x, P.y, -8);
    this.scene.add(glow);
  }

  buildStation() {
    const L = this.L;
    const accent = L.color;
    // Station sits below the ships' z so hovering ships always draw on top.
    this.station = new THREE.Group();
    this.station.position.set(0, L.hubY, -2);
    this.scene.add(this.station);

    const hub = solid(`hub${L.hubR.toFixed(1)}`, regularPolygon(6, L.hubR, Math.PI / 6), STEEL, { depth: 2.5 });
    const stripe = new THREE.Mesh(
      new THREE.RingGeometry(L.hubR * 0.72, L.hubR * 0.8, 6, 1, Math.PI / 6),
      new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.7) }),
    );
    stripe.position.z = 0.05;
    this.hubInner = solid(`hubIn${L.hubR.toFixed(1)}`, regularPolygon(6, L.hubR * 0.55), 0x8d9299, { depth: 0.8 });
    this.hubInner.position.z = 0.9;
    this.station.add(hub, stripe, this.hubInner);

    this.lights = [];
    const light = (parent, x, y, color, rate, phase) => {
      const m = new THREE.Mesh(circleGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.set(x, y, 0.15);
      parent.add(m);
      const rec = { m, rate, phase };
      this.lights.push(rec);
      return rec;
    };
    regularPolygon(6, L.hubR - 0.8, Math.PI / 6).forEach(([x, y], i) => light(this.station, x, y, 0xff3a2a, 1.5, i * 0.4));

    this.pads = [];
    this.arms = [];
    const r0 = L.hubR - 0.5;
    const r1 = L.armLen - PAD_R + 0.2;
    const armPts = [[r0, -ARM_HALF_W], [r1, -ARM_HALF_W], [r1, ARM_HALF_W], [r0, ARM_HALF_W]];
    for (let i = 0; i < L.padCount; i++) {
      const a = L.offset + (i / L.padCount) * Math.PI * 2;
      const arm = solid(`arm${r0.toFixed(1)}_${r1.toFixed(1)}`, armPts, 0x5d6168, { depth: 1 });
      arm.rotation.z = a;
      arm.position.z = -0.6;
      this.station.add(arm);
      this.arms.push({ a, r0, r1 });

      const pad = new THREE.Group();
      pad.position.set(Math.cos(a) * L.armLen, Math.sin(a) * L.armLen, -0.8);
      pad.add(solid('pad', regularPolygon(12, PAD_R), 0x484c52, { depth: 0.3 }));
      const marking = new THREE.Mesh(markingGeo, new THREE.MeshBasicMaterial({ color: 0x8a826a }));
      marking.position.z = 0.05;
      pad.add(marking);
      const num = textSprite(String(i + 1), '#a8a08a', 2.6);
      num.position.z = 0.1;
      pad.add(num);
      const padLights = [0.25, 0.75, 1.25, 1.75].map((k, j) =>
        light(pad, Math.cos(k * Math.PI) * (PAD_R + 0.9), Math.sin(k * Math.PI) * (PAD_R + 0.9), 0xffaa33, 3, j * 0.8),
      );
      this.station.add(pad);
      this.pads.push({ num: i + 1, a, group: pad, marking, numSprite: num, padLights, occupant: null, assigned: false });
    }

    this.drones = Array.from({ length: L.drones }, () => {
      const mesh = solid('drone', SHAPES.drone, 0xb3974c, { depth: 0.4 });
      this.station.add(mesh);
      const d = { mesh, lx: 0, ly: 0, state: 'weld', timer: 0 };
      this.pickDroneTarget(d);
      d.lx = d.tx;
      d.ly = d.ty;
      return d;
    });
  }

  styleAssignedPad() {
    const p = this.target;
    p.marking.material.color.set(ASSIGNED);
    p.group.remove(p.numSprite);
    p.numSprite = textSprite(String(p.num), ASSIGNED_CSS, 2.6);
    p.numSprite.position.z = 0.1;
    p.group.add(p.numSprite);
    for (const l of p.padLights) l.m.material.color.set(ASSIGNED);
    this.progressSegs = segGeos.map((g) => {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x7dff9a }));
      m.position.z = 0.1;
      m.visible = false;
      p.group.add(m);
      return m;
    });
  }

  buildGate() {
    const gx = this.L.gateX;
    this.gate = new THREE.Group();
    const post = [[-0.8, -3], [0.8, -3], [0.8, 3], [-0.8, 3]];
    for (const s of [-1, 1]) {
      const m = solid('gatePost', post, 0x5d6168, { depth: 1.2 });
      m.position.set(s * (GATE_HALF_W + 1), 0, -0.5);
      this.gate.add(m);
      const beacon = new THREE.Mesh(circleGeo, new THREE.MeshBasicMaterial({ color: ASSIGNED }));
      beacon.position.set(s * (GATE_HALF_W + 1), 2.2, 0.2);
      this.gate.add(beacon);
    }
    this.chevrons = [0, 1, 2].map((i) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-4, -1.2, 0), new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(4, -1.2, 0),
      ]);
      const c = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: ASSIGNED, transparent: true }));
      c.position.y = -3 + i * 3;
      this.gate.add(c);
      return c;
    });
    const label = textSprite('GATE', ASSIGNED_CSS, 2.2);
    label.position.set(0, -6, 0);
    this.gate.add(label);
    this.gate.position.set(gx, 45, 0);
    this.scene.add(this.gate);
  }

  // ---------------------------------------------------------------- geometry helpers

  toWorld(lx, ly) {
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    return { x: lx * c - ly * s, y: this.L.hubY + lx * s + ly * c };
  }

  padWorld(pad) {
    return this.toWorld(Math.cos(pad.a) * this.L.armLen, Math.sin(pad.a) * this.L.armLen);
  }

  outward(pad) {
    return { x: Math.cos(pad.a + this.rot), y: Math.sin(pad.a + this.rot) };
  }

  resize(w, h) {
    this.halfW = 50 * (w / h);
    this.playHalfW = Math.min(this.halfW, MAX_PLAY_HALF_W) - 2;
    Object.assign(this.camera, { left: -this.halfW, right: this.halfW });
    this.camera.updateProjectionMatrix();
  }

  setPhase(p) {
    this.phase = p;
    this.phaseT = 0;
  }

  setPaused(p) {
    this.paused = p;
    this.hud.setPaused(p);
  }

  // ---------------------------------------------------------------- loop

  update(dt) {
    if (this.done) return;
    if (this.input.hit('Escape', 'KeyP')) this.setPaused(!this.paused);
    if (this.paused) return;

    this.t += dt;
    this.phaseT += dt;
    this.rot += this.L.spin * dt;
    this.station.rotation.z = this.rot;
    this.hubInner.rotation.z = -this.t * 0.4;
    this.stars.update(dt, 1.5);
    for (const l of this.lights) l.m.material.opacity = Math.sin(this.t * l.rate * Math.PI + l.phase) > 0 ? 1 : 0.15;
    if (this.chevrons) this.chevrons.forEach((c, i) => (c.material.opacity = 0.25 + 0.75 * ((Math.sin(this.t * 5 - i * 1.2) + 1) / 2)));

    this.updatePhase(dt);
    this.updatePlayer(dt);
    this.updateTraffic(dt);
    this.updateDrones(dt);
    if (!this.player.attached && this.phase === 'fly') this.collide();
    this.particles.update(dt);

    this.bumpCd -= dt;
    this.shake *= Math.exp(-8 * dt);
    this.camera.position.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0);
    this.hud.update({ hull: this.player.hull, maxHull: this.player.maxHull, time: this.time, bumps: this.bumps, hint: this.hint });
  }

  updatePhase(dt) {
    const p = this.player;
    switch (this.phase) {
      case 'arrive': {
        const k = Math.min(1, this.phaseT / 1.2);
        p.y = -58 + 16 * Math.sin((k * Math.PI) / 2);
        if (k >= 1) this.setPhase('fly');
        break;
      }
      case 'clearance':
        if (this.phaseT > 1.2) this.setPhase('fly');
        break;
      case 'fly':
        this.time += dt;
        if (this.mode === 'dock') this.checkLanding(dt);
        else if (Math.abs(p.x - this.L.gateX) < GATE_HALF_W && p.y > GATE_Y) {
          this.setPhase('jump');
          this.hint = '';
          this.audio.play('launch');
          this.hud.banner('Engaging warp', 'The KL9 hunt at warp. Stay sharp.');
        }
        break;
      case 'docked':
        if (this.phaseT > 1.6) this.finish();
        break;
      case 'jump':
        p.vy += 140 * dt;
        p.y += p.vy * dt;
        this.particles.emit(p.x, p.y - 3.4, 3, 0xffb060, { speed: 10, angle: -Math.PI / 2, spread: 0.4, life: 0.5 });
        if (this.phaseT > 1.2) this.finish();
        break;
    }
  }

  checkLanding(dt) {
    const p = this.player;
    const pw = this.padWorld(this.target);
    const d = Math.hypot(p.x - pw.x, p.y - pw.y);
    const speed = Math.hypot(p.vx, p.vy);
    if (d < LAND_RADIUS) {
      if (speed < LAND_MAX_SPEED) {
        this.progress += dt;
        this.hint = 'Hold steady…';
        this.beepT -= dt;
        if (this.beepT <= 0) {
          this.audio.play('beep');
          this.beepT = 0.3;
        }
      } else {
        this.hint = 'Too fast. Slow down to land';
      }
    } else {
      this.progress = Math.max(0, this.progress - dt * 2);
      this.hint = d < PAD_R + 4 ? 'Center the ship on the pad' : '';
    }
    const k = Math.round((this.progress / LAND_TIME) * this.progressSegs.length);
    this.progressSegs.forEach((m, i) => (m.visible = i < k));
    if (this.progress >= LAND_TIME) {
      p.attached = true;
      p.vx = p.vy = 0;
      this.hint = '';
      this.setPhase('docked');
      this.audio.play('dock');
      this.hud.banner('Docked', this.bumps === 0 ? 'Precision docking!' : `${this.bumps} bump${this.bumps === 1 ? '' : 's'} logged`);
      for (const l of this.target.padLights) l.m.material.color.set(0x7dff9a);
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    const inp = this.input;
    const control = this.phase === 'fly';
    let ax = 0;
    let ay = 0;
    if (control) {
      ax = (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0);
      ay = (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0);
    }
    if (p.attached) {
      if (control && this.mode === 'undock' && (ax || ay)) p.attached = false;
      else {
        const pw = this.padWorld(this.target);
        p.x = pw.x;
        p.y = pw.y;
      }
    }
    if (!p.attached && this.phase !== 'arrive' && this.phase !== 'jump') {
      // Thrusters with inertia: the ship never turns, it drifts and must brake.
      const maxV = this.stats.speed * 0.8;
      const accel = maxV * 2.6;
      const len = Math.hypot(ax, ay) || 1;
      p.vx += (ax / len) * accel * dt;
      p.vy += (ay / len) * accel * dt;
      const damp = Math.exp(-(ax || ay ? 0.6 : 1.8) * dt);
      p.vx *= damp;
      p.vy *= damp;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > maxV) {
        p.vx *= maxV / sp;
        p.vy *= maxV / sp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (Math.abs(p.x) > this.playHalfW) {
        p.x = clamp(p.x, -this.playHalfW, this.playHalfW);
        p.vx = 0;
      }
      const top = this.mode === 'undock' ? TOP + 2 : TOP - 3;
      if (p.y < BOTTOM + 3 || p.y > top) {
        p.y = clamp(p.y, BOTTOM + 3, top);
        p.vy = 0;
      }
      // RCS puffs opposite the thrust direction
      if (ax && Math.random() < 0.7) this.particles.emit(p.x - ax * 3, p.y - 1, 1, 0xaaccff, { speed: 12, angle: ax > 0 ? Math.PI : 0, spread: 0.5, life: 0.25 });
      if (ay < 0 && Math.random() < 0.7) this.particles.emit(p.x, p.y + 3.5, 1, 0xaaccff, { speed: 12, angle: Math.PI / 2, spread: 0.5, life: 0.25 });
    }

    const g = this.ship.group;
    g.position.set(p.x, p.y, 0.5);
    this.ship.flame.visible = ay > 0 || this.phase === 'jump' || this.phase === 'arrive';
    this.ship.flame.scale.set(1, 0.7 + Math.random() * 0.5 + (this.phase === 'jump' ? 1.2 : 0), 1);
    this.ship.setDamage(1 - p.hull / p.maxHull);
    this.ship.update(dt, this.particles, p.x, p.y);

    // Guide line to the objective
    const pos = this.guide.geometry.attributes.position;
    const tgt = this.mode === 'dock' ? this.padWorld(this.target) : { x: this.L.gateX, y: 46 };
    const showGuide = this.phase === 'fly' && !p.attached;
    this.guide.visible = showGuide;
    if (showGuide) {
      pos.setXYZ(0, p.x, p.y, 0.1);
      pos.setXYZ(1, tgt.x, tgt.y, 0.1);
      pos.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- traffic

  newNpcMesh(type) {
    return solid(type, SHAPES[type], pick(NPC_COLORS), { glass: GLASS[type] });
  }

  spawnVisitor(alreadyDocked = false) {
    const free = this.pads.filter((p) => !p.occupant && !p.assigned);
    if (!free.length) return this.spawnTransit();
    const pad = pick(free);
    const type = weightedPick(Object.keys(NPC_TYPES), (k) => NPC_TYPES[k].weight);
    const def = NPC_TYPES[type];
    const pw = this.padWorld(pad);
    const out = this.outward(pad);
    const n = {
      kind: 'visitor', type, pad, r: def.r, speed: rand(...def.speed), mesh: this.newNpcMesh(type),
      x: alreadyDocked ? pw.x : pw.x + out.x * 80, y: alreadyDocked ? pw.y : pw.y + out.y * 80, vx: 0, vy: 0,
      state: alreadyDocked ? 'docked' : 'inbound', wait: rand(3, 9),
    };
    n.mesh.rotation.z = Math.atan2(-out.y, -out.x) - Math.PI / 2;
    pad.occupant = n;
    this.scene.add(n.mesh);
    this.npcs.push(n);
  }

  spawnTransit(midScreen = false) {
    const type = weightedPick(Object.keys(NPC_TYPES), (k) => NPC_TYPES[k].weight);
    const def = NPC_TYPES[type];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = rand(...def.speed);
    const n = {
      kind: 'transit', type, r: def.r, speed, mesh: this.newNpcMesh(type),
      x: midScreen ? rand(-this.halfW * 0.6, this.halfW * 0.6) : -dir * (this.halfW + 10),
      y: rand(-36, 40), vx: dir * speed, vy: rand(-2, 2),
    };
    this.scene.add(n.mesh);
    this.npcs.push(n);
  }

  moveToward(n, tx, ty, speed, dt) {
    const dx = tx - n.x;
    const dy = ty - n.y;
    const d = Math.hypot(dx, dy);
    if (d <= speed * dt) {
      n.x = tx;
      n.y = ty;
      return true;
    }
    n.vx = (dx / d) * speed;
    n.vy = (dy / d) * speed;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    return false;
  }

  updateTraffic(dt) {
    this.spawnCd -= dt;
    if (this.spawnCd <= 0 && this.npcs.length < this.L.traffic) {
      if (Math.random() < 0.6) this.spawnVisitor();
      else this.spawnTransit();
      this.spawnCd = rand(1.2, 3);
    }
    for (const n of this.npcs) {
      if (n.kind === 'transit') {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (Math.abs(n.x) > this.halfW + 15) n.dead = true;
      } else {
        const pw = this.padWorld(n.pad);
        const out = this.outward(n.pad);
        switch (n.state) {
          case 'inbound':
            if (this.moveToward(n, pw.x + out.x * 12, pw.y + out.y * 12, n.speed, dt)) n.state = 'final';
            break;
          case 'final':
            if (this.moveToward(n, pw.x, pw.y, 5, dt)) n.state = 'docked';
            break;
          case 'docked':
            n.x = pw.x;
            n.y = pw.y;
            n.vx = n.vy = 0;
            n.wait -= dt;
            if (n.wait <= 0) n.state = 'undock';
            break;
          case 'undock':
            if (this.moveToward(n, pw.x + out.x * 12, pw.y + out.y * 12, 5, dt)) {
              n.state = 'outbound';
              n.pad.occupant = null;
              n.vx = out.x * n.speed;
              n.vy = out.y * n.speed;
            }
            break;
          case 'outbound':
            n.x += n.vx * dt;
            n.y += n.vy * dt;
            if (Math.abs(n.x) > this.halfW + 15 || Math.abs(n.y) > 70) n.dead = true;
            break;
        }
      }
      if (n.vx || n.vy) n.mesh.rotation.z = Math.atan2(n.vy, n.vx) - Math.PI / 2;
      n.mesh.position.set(n.x, n.y, 0.3);
      if ((n.vx || n.vy) && Math.random() < 0.4) {
        const sp = Math.hypot(n.vx, n.vy) || 1;
        this.particles.emit(n.x - (n.vx / sp) * n.r * 1.2, n.y - (n.vy / sp) * n.r * 1.2, 1, 0xff9944, { speed: 3, life: 0.35 });
      }
    }
    this.npcs = this.npcs.filter((n) => {
      if (!n.dead) return true;
      if (n.pad?.occupant === n) n.pad.occupant = null;
      this.scene.remove(n.mesh);
      disposeModel(n.mesh);
      return false;
    });
  }

  pickDroneTarget(d) {
    const arm = pick(this.arms);
    const along = rand(arm.r0 + 2, arm.r1 - 1);
    const side = (Math.random() < 0.5 ? -1 : 1) * rand(1.8, 2.6);
    d.tx = Math.cos(arm.a) * along - Math.sin(arm.a) * side;
    d.ty = Math.sin(arm.a) * along + Math.cos(arm.a) * side;
    d.state = 'move';
  }

  updateDrones(dt) {
    for (const d of this.drones) {
      if (d.state === 'move') {
        const dx = d.tx - d.lx;
        const dy = d.ty - d.ly;
        const dist = Math.hypot(dx, dy);
        const step = 7 * dt;
        if (dist <= step) {
          d.lx = d.tx;
          d.ly = d.ty;
          d.state = 'weld';
          d.timer = rand(2, 4);
        } else {
          d.lx += (dx / dist) * step;
          d.ly += (dy / dist) * step;
        }
      } else {
        d.timer -= dt;
        if (Math.random() < 0.3) {
          const w = this.toWorld(d.lx, d.ly);
          this.particles.emit(w.x, w.y, 1, Math.random() < 0.7 ? 0xcc8833 : 0xbbbbbb, { speed: 14, life: 0.3, drag: 5 });
        }
        if (d.timer <= 0) this.pickDroneTarget(d);
      }
      d.mesh.position.set(d.lx, d.ly, 0.4);
      d.mesh.rotation.z = this.t * 3;
    }
  }

  // ---------------------------------------------------------------- collisions

  collide() {
    const L = this.L;
    const hub = this.toWorld(0, 0);
    this.pushOut(hub.x, hub.y, L.hubR);
    for (const arm of this.arms) {
      const a = this.toWorld(Math.cos(arm.a) * arm.r0, Math.sin(arm.a) * arm.r0);
      const b = this.toWorld(Math.cos(arm.a) * arm.r1, Math.sin(arm.a) * arm.r1);
      const p = this.player;
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const k = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby), 0, 1);
      this.pushOut(a.x + abx * k, a.y + aby * k, ARM_HALF_W);
    }
    for (const n of this.npcs) this.pushOut(n.x, n.y, n.r, n.vx, n.vy);
    for (const d of this.drones) {
      const w = this.toWorld(d.lx, d.ly);
      this.pushOut(w.x, w.y, 0.9);
    }
  }

  // Separate the ship from a circular obstacle and bounce; hard impacts count as bumps.
  pushOut(cx, cy, r, cvx = 0, cvy = 0) {
    const p = this.player;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const min = r + PLAYER_R;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return;
    const d = Math.sqrt(d2) || 0.001;
    const nx = dx / d;
    const ny = dy / d;
    p.x = cx + nx * min;
    p.y = cy + ny * min;
    const vn = (p.vx - cvx) * nx + (p.vy - cvy) * ny;
    if (vn < 0) {
      p.vx -= 1.5 * vn * nx;
      p.vy -= 1.5 * vn * ny;
      if (-vn > BUMP_MIN_SPEED) this.bump(cx + nx * r, cy + ny * r);
    }
  }

  bump(x, y) {
    if (this.bumpCd > 0 || this.app.cheats.god) return;
    this.bumpCd = 0.5;
    this.bumps++;
    const p = this.player;
    p.hull = Math.max(1, p.hull - p.maxHull * BUMP_DAMAGE); // docking can't destroy the ship
    this.shake = 1.2;
    this.audio.play('bump');
    this.particles.emit(x, y, 14, 0xffaa55, { speed: 20, life: 0.4 });
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.onDone({ hull: this.player.hull, bumps: this.bumps, time: this.time });
  }

  dispose() {
    this.done = true;
    this.input.captureKeys = false;
    this.hud.destroy();
    this.stars.dispose();
    this.particles.dispose();
    this.scene.traverse((o) => {
      disposeModel(o);
    });
    this.planet.geometry.dispose();
    this.planet.material.dispose();
    for (const l of this.lights) l.m.material.dispose();
    for (const p of this.pads) p.marking.material.dispose();
    for (const m of this.progressSegs) m.material.dispose();
  }
}
