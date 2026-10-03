import * as THREE from 'three';
import { Starfield } from '../fx/starfield.js';
import { Particles } from '../fx/particles.js';
import { solid, rock, flatShape, setFlash, disposeModel, addLights } from '../fx/model.js';
import { SHAPES, GLASS, ASTEROID_VARIANTS } from '../fx/shapes.js';
import { PLAYER_COLOR, ESCORT_COLORS, createPlayerShip, createEscortShip } from '../fx/ship.js';
import { ENEMIES, WEAPONS, WEAPON_ORDER, HP_GROWTH, DMG_GROWTH, PAY_GROWTH } from '../data.js';
import { shipStats } from '../state.js';
import { TravelHUD } from '../ui/hud.js';
import { rand, randInt, pick, clamp, shuffle } from '../rng.js';

const TOP = 50;
const BOTTOM = -50;
const SPAWN_Y = 58;
const MAX_PLAY_HALF_W = 70;
const PLAYER_R = 1.3;
const ESCORT_R = 1.05;
const ESCORT_HULL = 28;
const ESCORT_RATE = 4;
const ESCORT_DMG = 0.2;
const ESCORT_RESPAWN = 3;
const MIN_HOSTILES_PER_WAVE = 6; // asteroids are obstacles and don't count
const HOMING_SHOT_LIFE = 4; // seconds before a tracking shot burns out
const SEEKER_SHOT = [[0, 1.4], [0.6, -0.8], [0, -0.3], [-0.6, -0.8]];

const circleGeo = new THREE.CircleGeometry(0.7, 10);
const pelletGeo = new THREE.CircleGeometry(0.45, 8);
const boltGeo = new THREE.PlaneGeometry(0.45, 2.6);
const beamGeo = new THREE.PlaneGeometry(1, 1);
const matCache = new Map();
function basicMat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshBasicMaterial({ color }));
  return matCache.get(color);
}

// Plan waves of spawn groups whose total "cost" grows with difficulty and wave index.
// Types are dealt from a shuffled deck shared across the trip, so every flight
// sees a mix of all enemy types before any repeats.
function planWaves(d, count) {
  const types = Object.keys(ENEMIES).filter((id) => id !== 'boss');
  let deck = [];
  return Array.from({ length: count }, (_, w) => {
    const budget = 6 + d * 1.9 + w * 2.5;
    const groups = [];
    let spent = 0;
    let t = 0.3;
    let hostiles = 0;
    while (spent < budget || hostiles < MIN_HOSTILES_PER_WAVE) {
      if (!deck.length) deck = shuffle([...types]);
      const type = deck.pop();
      // Once the budget is spent we're only topping up hostiles; asteroids don't count.
      if (spent >= budget && type === 'asteroid') continue;
      const def = ENEMIES[type];
      const fit = Math.max(1, Math.floor((budget - spent) / def.cost) + 1);
      const n = Math.min(randInt(def.group[0], def.group[1]), fit);
      groups.push({ time: t, type, n, formation: pick(def.formations) });
      spent += def.cost * n;
      if (type !== 'asteroid') hostiles += n;
      t += rand(2, 3.6);
    }
    return groups;
  });
}

export class TravelView {
  constructor(app, { state, from, to, contract, isFinal, hull, onDone }) {
    this.toName = to;
    this.app = app;
    this.audio = app.audio;
    this.input = app.input;
    this.onDone = onDone;
    this.d = contract.difficulty;
    this.hpMult = Math.pow(HP_GROWTH, this.d - 1);
    this.dmgMult = Math.pow(DMG_GROWTH, this.d - 1);
    this.payMult = Math.pow(PAY_GROWTH, this.d - 1);
    this.bulletSpeed = 1 + 0.04 * (this.d - 1);
    this.fireRate = 1.1 + 0.06 * (this.d - 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07080a);
    addLights(this.scene);
    this.camera = new THREE.OrthographicCamera(-50, 50, TOP, BOTTOM, -10, 10);
    this.stars = new Starfield(this.scene, app.pixelRatio);
    this.particles = new Particles(this.scene, app.pixelRatio);

    const stats = shipStats(state);
    this.stats = stats;
    this.owned = WEAPON_ORDER.filter((w) => state.weapons.includes(w));
    this.player = {
      x: 0, y: -62,
      hull: Math.min(hull ?? state.hull, stats.maxHull), maxHull: stats.maxHull,
      shield: stats.maxShield, maxShield: stats.maxShield,
      invuln: 0, regenDelay: 0, cooldown: 0,
      weapon: this.owned.includes(state.weapon) ? state.weapon : 'pulse',
    };
    this.buildPlayerMesh();
    this.helpers = new Map();
    this.app.party?.setMode('travel');

    this.enemies = [];
    this.pShots = [];
    this.eShots = [];
    this.spawnQueue = [];
    this.bounty = 0;
    this.kills = 0;
    this.bossKilled = false;
    this.shake = 0;
    this.auto = false;
    this.paused = false;
    this.done = false;

    const waveCount = isFinal ? 5 : contract.waves;
    this.hasBoss = contract.forceBoss ?? (isFinal || Math.random() < 0.15 + 0.035 * this.d);
    this.waves = planWaves(this.d, waveCount);
    this.waveIndex = -1;
    this.setPhase('intro');

    this.hud = new TravelHUD(app.hud, {
      from, to, difficulty: this.d, owned: this.owned,
      onResume: () => this.setPaused(false),
      onRetreat: () => this.finish({ success: false, retreat: true }),
    });
    this.hud.banner(`Departing ${from}`, `${contract.good} bound for ${to}`);
    this.audio.play('launch');
    this.input.captureKeys = true;
    document.activeElement?.blur?.();
  }

  buildPlayerMesh() {
    const ship = createPlayerShip();
    const g = ship.group;
    this.flame = ship.flame;
    this.shieldRing = ship.shieldRing;
    this.beamMesh = new THREE.Group();
    const outer = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: WEAPONS.beam.color, transparent: true, opacity: 0.35 }));
    outer.scale.x = 1.4;
    const inner = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xc8d4ff, transparent: true, opacity: 0.8 }));
    inner.scale.x = 0.3;
    this.beamMesh.add(outer, inner);
    this.beamMesh.visible = false;
    this.scene.add(this.beamMesh);
    this.playerMesh = g;
    this.scene.add(g);
  }

  resize(w, h) {
    const aspect = w / h;
    this.halfW = 50 * aspect;
    this.playHalfW = Math.min(this.halfW, MAX_PLAY_HALF_W) - 3;
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
    if (p) this.audio.beam(false);
  }

  // ---------------------------------------------------------------- main loop

  update(dt) {
    if (this.done) return;
    if (this.input.hit('Escape', 'KeyP')) this.setPaused(!this.paused);
    if (this.paused) return;

    this.phaseT += dt;
    this.stars.update(dt, this.phase === 'outro' ? 28 + this.phaseT * 70 : 28);
    this.updatePhase(dt);

    const controllable = ['banner', 'wave', 'bossWarn', 'boss', 'intro'].includes(this.phase) && !(this.phase === 'intro' && this.phaseT < 1.2);
    if (this.phase !== 'dead') this.updatePlayer(dt, controllable);
    if (this.phase !== 'dead') this.updateEscorts(dt, controllable);
    this.updateEnemies(dt);
    this.updateShots(dt);
    if (this.phase !== 'dead' && this.phase !== 'outro') this.collide();
    this.particles.update(dt);
    this.cleanup();

    this.shake *= Math.exp(-8 * dt);
    this.camera.position.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0);

    const boss = this.enemies.find((e) => e.type === 'boss');
    this.hud.update({
      hull: this.player.hull, maxHull: this.player.maxHull,
      shield: this.player.shield, maxShield: this.player.maxShield,
      bounty: this.bounty, weapon: this.player.weapon, auto: this.auto,
      waveText: this.waveText(),
      boss: boss ? Math.max(0, boss.hp / boss.maxHp) : null,
    });
  }

  waveText() {
    if (this.phase === 'boss' || this.phase === 'bossWarn') {
      const escorts = this.enemies.filter((e) => this.isHostile(e) && e.type !== 'boss').length;
      return `CAPITAL SHIP${escorts ? ` · ${escorts} ESCORT${escorts === 1 ? '' : 'S'}` : ''}`;
    }
    if (this.phase === 'outro') return 'DOCKING';
    if (this.waveIndex < 0) return 'EN ROUTE';
    const left = this.phase === 'wave' ? ` · ${this.hostilesLeft()} LEFT` : '';
    return `WAVE ${this.waveIndex + 1} / ${this.waves.length}${this.hasBoss ? ' + BOSS' : ''}${left}`;
  }

  updatePhase(dt) {
    switch (this.phase) {
      case 'intro':
        if (this.phaseT < 1.2) this.player.y = -62 + 30 * Math.sin((this.phaseT / 1.2) * (Math.PI / 2));
        if (this.phaseT > 2.4) this.nextWave();
        break;
      case 'banner':
        if (this.phaseT > 1.6) {
          this.setPhase('wave');
          this.waveT = 0;
        }
        break;
      case 'wave':
        this.waveT += dt;
        while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveT) {
          const s = this.spawnQueue.shift();
          this.spawnEnemy(s.type, s.x, s.y);
        }
        if (!this.spawnQueue.length && !this.enemies.some((e) => this.isHostile(e))) this.nextWave();
        break;
      case 'bossWarn':
        if (this.phaseT > 2.6) {
          this.spawnEnemy('boss', 0, SPAWN_Y + 8);
          this.setPhase('boss');
        }
        break;
      case 'boss':
        if (this.bossKilled && !this.enemies.some((e) => this.isHostile(e))) {
          if (!this.bossClearT) this.bossClearT = this.phaseT;
          if (this.phaseT - this.bossClearT > 1.5) this.startOutro();
        }
        break;
      case 'outro':
        this.updateOutro(dt);
        break;
      case 'dead':
        if (this.phaseT > 2.8) this.finish({ success: false, destroyed: true });
        break;
    }
  }

  nextWave() {
    this.waveIndex++;
    if (this.waveIndex < this.waves.length) {
      this.buildSpawnQueue(this.waves[this.waveIndex]);
      this.setPhase('banner');
      this.hud.banner(`Wave ${this.waveIndex + 1}`, this.waveIndex === this.waves.length - 1 && !this.hasBoss ? 'Final wave' : '');
      this.audio.play('wave');
    } else if (this.hasBoss && !this.bossKilled && this.phase !== 'boss') {
      this.setPhase('bossWarn');
      this.hud.banner('WARNING', 'Hostile capital ship inbound', 'danger');
      this.audio.play('bossWarn');
    } else {
      this.startOutro();
    }
  }

  buildSpawnQueue(groups) {
    const W = this.playHalfW;
    const q = [];
    for (const g of groups) {
      const { n, type, time } = g;
      switch (g.formation) {
        case 'line': {
          const span = Math.min(W * 1.6, (n - 1) * 9);
          for (let i = 0; i < n; i++) q.push({ at: time, type, x: n === 1 ? rand(-W / 2, W / 2) : -span / 2 + (span * i) / (n - 1), y: SPAWN_Y });
          break;
        }
        case 'column': {
          const x = rand(-W * 0.8, W * 0.8);
          for (let i = 0; i < n; i++) q.push({ at: time + i * 0.45, type, x, y: SPAWN_Y });
          break;
        }
        case 'v': {
          const cx = rand(-W * 0.5, W * 0.5);
          const mid = (n - 1) / 2;
          for (let i = 0; i < n; i++) q.push({ at: time, type, x: cx + (i - mid) * 5, y: SPAWN_Y + Math.abs(i - mid) * 4 });
          break;
        }
        default:
          for (let i = 0; i < n; i++) q.push({ at: time + i * 0.35, type, x: rand(-W * 0.9, W * 0.9), y: SPAWN_Y });
      }
    }
    this.spawnQueue = q.sort((a, b) => a.at - b.at);
  }

  // ---------------------------------------------------------------- player

  updatePlayer(dt, controllable) {
    const p = this.player;
    const inp = this.input;
    let mx = 0;
    let my = 0;
    if (controllable) {
      mx = (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0);
      my = (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0);
      const len = Math.hypot(mx, my) || 1;
      p.x = clamp(p.x + (mx / len) * this.stats.speed * dt, -this.playHalfW, this.playHalfW);
      p.y = clamp(p.y + (my / len) * this.stats.speed * dt, BOTTOM + 5, TOP - 12);

      WEAPON_ORDER.forEach((w, i) => {
        if (inp.hit(`Digit${i + 1}`) && this.owned.includes(w)) p.weapon = w;
      });
      if (inp.hit('KeyQ', 'KeyE')) {
        const i = this.owned.indexOf(p.weapon);
        const dir = inp.hit('KeyE') ? 1 : -1;
        p.weapon = this.owned[(i + dir + this.owned.length) % this.owned.length];
      }
      if (inp.hit('KeyF')) this.auto = !this.auto;
    }

    p.cooldown -= dt;
    const firing = controllable && this.phase !== 'intro' && (this.auto || inp.down('Space', 'KeyJ'));
    this.fire(dt, firing);

    // Shields recharge after a short delay without taking damage.
    p.invuln -= dt;
    p.regenDelay -= dt;
    if (p.regenDelay <= 0 && p.shield < p.maxShield) p.shield = Math.min(p.maxShield, p.shield + p.maxShield * 0.22 * dt);

    const m = this.playerMesh;
    m.position.set(p.x, p.y, 0);
    m.visible = p.invuln <= 0 || Math.floor(p.invuln * 20) % 2 === 0;
    this.flame.scale.set(1, 0.7 + Math.random() * 0.5 + my * 0.4, 1);
    this.shieldRing.visible = p.shield > 0.5;
    this.shieldRing.material.opacity = 0.15 + 0.35 * (p.shield / (p.maxShield || 1)) + (p.shieldFlash > 0 ? 0.5 : 0);
    p.shieldFlash = (p.shieldFlash || 0) - dt;
    if (Math.random() < 0.6) this.particles.emit(p.x, p.y - 3.4, 1, 0xff8833, { speed: 12, angle: -Math.PI / 2, spread: 0.6, life: 0.3 });
  }

  fire(dt, firing) {
    const p = this.player;
    const beamOn = firing && p.weapon === 'beam';
    this.beamMesh.visible = beamOn;
    this.audio.beam(beamOn);
    if (beamOn) return this.fireBeam(dt);
    if (!firing || p.cooldown > 0) return;
    const w = WEAPONS[p.weapon];
    const dmg = w.dmg * this.stats.dmgMult;
    p.cooldown = 1 / w.rate;
    switch (p.weapon) {
      case 'pulse':
        this.addShot({ kind: 'bolt', x: p.x, y: p.y + 3, vx: 0, vy: 115, dmg, r: 0.9, color: w.color });
        break;
      case 'scatter':
        for (let i = 0; i < w.pellets; i++) {
          const a = Math.PI / 2 + (i - (w.pellets - 1) / 2) * 0.17;
          this.addShot({ kind: 'pellet', x: p.x, y: p.y + 2.5, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, dmg, r: 0.9, life: 0.75, color: w.color });
        }
        break;
      case 'seeker':
        for (const s of [-1, 1]) this.addShot({ kind: 'missile', x: p.x + s * 2.5, y: p.y, vx: s * 25, vy: 25, dmg, r: 1, life: 3.5, color: w.color });
        break;
    }
    this.audio.play(p.weapon);
  }

  fireBeam(dt) {
    const p = this.player;
    let target = null;
    for (const e of this.enemies) {
      if (e.dead || e.y < p.y || e.y > TOP + 2) continue;
      if (Math.abs(e.x - p.x) < e.r + 0.8 && (!target || e.y < target.y)) target = e;
    }
    const endY = target ? target.y - target.r * 0.6 : TOP + 5;
    const y0 = p.y + 3.5;
    for (const h of this.eShots) {
      if (!h.dead && h.homing && h.y > y0 - 1 && h.y < endY && Math.abs(h.x - p.x) < h.r + 0.8) this.shootDown(h);
    }
    this.beamMesh.position.set(p.x, (y0 + endY) / 2, 0.2);
    this.beamMesh.scale.set(1 + Math.random() * 0.3, Math.max(0.1, endY - y0), 1);
    if (target) {
      this.damageEnemy(target, WEAPONS.beam.dps * this.stats.dmgMult * dt, true);
      if (Math.random() < 0.5) this.particles.emit(p.x, endY, 2, WEAPONS.beam.color, { speed: 25, angle: -Math.PI / 2, spread: 2, life: 0.3 });
    }
  }

  addShot(s) {
    let mesh;
    if (s.kind === 'bolt') mesh = new THREE.Mesh(boltGeo, basicMat(s.color));
    else if (s.kind === 'pellet') mesh = new THREE.Mesh(pelletGeo, basicMat(s.color));
    else mesh = flatShape('missile', SHAPES.missile, s.color);
    mesh.position.set(s.x, s.y, 0.1);
    this.scene.add(mesh);
    s.mesh = mesh;
    s.age = 0;
    this.pShots.push(s);
  }

  hitPlayer(dmg) {
    const p = this.player;
    if (p.invuln > 0 || this.phase === 'dead' || this.phase === 'outro' || this.app.cheats.god) return;
    const absorbed = Math.min(p.shield, dmg);
    p.shield -= absorbed;
    const hullDmg = dmg - absorbed;
    p.hull -= hullDmg;
    p.regenDelay = 2.5;
    if (hullDmg > 0) {
      p.invuln = 0.5;
      this.shake = Math.max(this.shake, 1.4);
      this.audio.play('playerHit');
      this.particles.emit(p.x, p.y, 14, 0xff5533, { speed: 25, life: 0.5 });
    } else {
      p.invuln = 0.15;
      p.shieldFlash = 0.12;
      this.audio.play('shieldHit');
      this.particles.emit(p.x, p.y, 8, 0x4488ff, { speed: 20, life: 0.4 });
    }
    if (p.hull <= 0) {
      p.hull = 0;
      this.playerMesh.visible = false;
      this.beamMesh.visible = false;
      this.audio.beam(false);
      this.particles.explode(p.x, p.y, PLAYER_COLOR, 4);
      this.particles.explode(p.x, p.y, 0xff8833, 3);
      this.shake = 3;
      this.audio.play('death');
      this.hud.banner('SHIP DESTROYED', 'Emergency beacon activated…', 'danger');
      this.setPhase('dead');
    }
  }

  // ---------------------------------------------------------------- escorts

  spawnHelper(inp) {
    const color = ESCORT_COLORS[inp.color] ?? ESCORT_COLORS[0];
    const ship = createEscortShip(color);
    this.scene.add(ship.group);
    const h = {
      id: inp.id,
      callsign: inp.callsign,
      color,
      x: this.player.x + (this.helpers.size % 2 ? 7 : -7),
      y: this.player.y - 5,
      hull: ESCORT_HULL,
      maxHull: ESCORT_HULL,
      cooldown: 0,
      invuln: 1,
      respawn: 0,
      mx: 0,
      my: 0,
      fire: false,
      mesh: ship.group,
      flame: ship.flame,
    };
    this.helpers.set(inp.id, h);
    return h;
  }

  removeHelper(h) {
    this.scene.remove(h.mesh);
    disposeModel(h.mesh);
    this.helpers.delete(h.id);
  }

  updateEscorts(dt, controllable) {
    const party = this.app.party;
    if (!party?.ready) return;
    const live = party.inputs();
    const seen = new Set();
    for (const inp of live) {
      seen.add(inp.id);
      let h = this.helpers.get(inp.id);
      if (!h) h = this.spawnHelper(inp);
      h.mx = inp.mx;
      h.my = inp.my;
      h.fire = inp.fire;
    }
    for (const [id, h] of [...this.helpers]) {
      if (!seen.has(id)) this.removeHelper(h);
    }
    for (const h of this.helpers.values()) this.stepHelper(h, dt, controllable);
  }

  stepHelper(h, dt, controllable) {
    h.invuln -= dt;
    if (h.respawn > 0) {
      h.respawn -= dt;
      h.mesh.visible = false;
      if (h.respawn <= 0) {
        h.hull = h.maxHull;
        h.invuln = 1.2;
        h.x = clamp(this.player.x + (Math.random() < 0.5 ? -7 : 7), -this.playHalfW, this.playHalfW);
        h.y = this.player.y - 4;
      }
      this.app.party?.setVitals(h.id, Math.max(0, h.hull), h.maxHull);
      return;
    }
    let my = 0;
    if (controllable) {
      const mx = h.mx;
      my = h.my;
      const len = Math.hypot(mx, my) || 1;
      h.x = clamp(h.x + (mx / len) * this.stats.speed * dt, -this.playHalfW, this.playHalfW);
      h.y = clamp(h.y + (my / len) * this.stats.speed * dt, BOTTOM + 5, TOP - 12);
    }
    h.cooldown -= dt;
    const firing = controllable && this.phase !== 'intro' && h.fire;
    if (firing && h.cooldown <= 0) {
      h.cooldown = 1 / ESCORT_RATE;
      const dmg = WEAPONS.pulse.dmg * this.stats.dmgMult * ESCORT_DMG;
      this.addShot({ kind: 'bolt', x: h.x, y: h.y + 2.2, vx: 0, vy: 115, dmg, r: 0.7, color: WEAPONS.pulse.color });
    }
    h.mesh.position.set(h.x, h.y, 0);
    h.mesh.visible = h.invuln <= 0 || Math.floor(h.invuln * 20) % 2 === 0;
    h.flame.scale.set(1, 0.7 + Math.random() * 0.5 + my * 0.4, 1);
    if (Math.random() < 0.45) this.particles.emit(h.x, h.y - 2.2, 1, 0xff8833, { speed: 10, angle: -Math.PI / 2, spread: 0.6, life: 0.25 });
    this.app.party?.setVitals(h.id, h.hull, h.maxHull);
  }

  hitEscort(h, dmg) {
    if (h.invuln > 0 || h.respawn > 0 || this.phase === 'outro') return;
    h.hull -= dmg;
    h.invuln = 0.45;
    this.particles.emit(h.x, h.y, 10, 0xff5533, { speed: 22, life: 0.4 });
    this.audio.play('playerHit');
    if (h.hull > 0) return;
    h.hull = 0;
    h.respawn = ESCORT_RESPAWN;
    h.mesh.visible = false;
    this.particles.explode(h.x, h.y, h.color, 2.4);
    this.audio.play('explode');
  }

  // ---------------------------------------------------------------- enemies

  spawnEnemy(type, x, y) {
    const def = ENEMIES[type];
    let mesh;
    let size = 1;
    if (type === 'asteroid') {
      const v = randInt(0, ASTEROID_VARIANTS - 1);
      mesh = rock(v, def.color);
      size = rand(0.75, 1.35);
      mesh.scale.setScalar(size);
    } else {
      mesh = solid(type, SHAPES[type], def.color, { glass: GLASS[type] });
    }
    mesh.position.set(x, y, 0);
    this.scene.add(mesh);
    const hp = def.hp * this.hpMult * size * size;
    const e = {
      type, def, mesh, x, y, baseX: x, vx: 0, vy: -def.speed,
      r: def.r * size, hp, maxHp: hp, t: 0, flash: 0, phase: rand(0, Math.PI * 2),
      fireT: def.fire ? rand(...def.fire.interval) * 0.7 : Infinity,
      holdY: rand(12, 34), spin: rand(-1.5, 1.5),
    };
    if (type === 'asteroid') e.vx = rand(-5, 5);
    if (type === 'sniper') e.holdY = rand(32, 42);
    if (type === 'gunship') e.holdY = rand(22, 36);
    if (type === 'boss') {
      e.holdY = 30;
      e.pattern = 0;
      e.patternT = 0;
      e.shotT = 0;
      e.spiralA = 0;
    }
    this.enemies.push(e);
    return e;
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt;
      const def = e.def;
      switch (e.type) {
        case 'scout':
          e.y -= def.speed * dt;
          e.x = e.baseX + Math.sin(e.t * 1.8 + e.phase) * 8;
          break;
        case 'asteroid':
          e.x += e.vx * dt;
          e.y -= def.speed * dt;
          e.mesh.userData.rock.rotation.x += e.spin * dt;
          e.mesh.userData.rock.rotation.y += e.spin * 0.7 * dt;
          break;
        case 'fighter':
          // Hovers and shadows the player; shifts altitude now and then. Never leaves.
          if (e.t > (e.reholdT || 7)) {
            e.holdY = rand(12, 34);
            e.reholdT = e.t + rand(5, 8);
          }
          e.y += (e.holdY - e.y) * Math.min(1, dt * 1.5);
          e.x += clamp(p.x - e.x, -1, 1) * def.speed * 0.7 * dt;
          break;
        case 'kamikaze':
          if (e.t < 0.9) {
            e.y -= 18 * dt;
          } else {
            if (!e.locked) {
              const a = Math.atan2(p.y - e.y, p.x - e.x);
              e.vx = Math.cos(a) * def.speed;
              e.vy = Math.sin(a) * def.speed;
              e.locked = true;
            }
            e.x += e.vx * dt;
            e.y += e.vy * dt;
          }
          e.mesh.rotation.z += 8 * dt;
          break;
        case 'gunship':
          e.y += (e.holdY - e.y) * Math.min(1, dt * 0.8);
          e.x = clamp(e.baseX + Math.sin(e.t * 0.5) * 15, -this.playHalfW, this.playHalfW);
          break;
        case 'sniper':
          e.y += (e.holdY - e.y) * Math.min(1, dt * 1.2);
          if (!e.moveT || e.t > e.moveT) {
            e.targetX = rand(-this.playHalfW * 0.9, this.playHalfW * 0.9);
            e.moveT = e.t + 3;
          }
          e.x += (e.targetX - e.x) * Math.min(1, dt * 1.5);
          if (e.burst > 0) {
            e.burstT -= dt;
            if (e.burstT <= 0) {
              this.aimedShot(e, def.fire.speed * this.bulletSpeed, def.fire.dmg * this.dmgMult, 0x44ff88);
              e.burst--;
              e.burstT = 0.14;
            }
          }
          break;
        case 'boss':
          this.updateBoss(e, dt);
          break;
      }

      if (def.fire && e.type !== 'boss') {
        e.fireT -= dt * this.fireRate;
        if (e.fireT <= 0) {
          e.fireT = rand(...def.fire.interval);
          if (e.y < TOP - 1 && e.y > p.y + 4) this.enemyFire(e);
        }
      }

      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) setFlash(e.mesh, false);
      }
      e.mesh.position.set(e.x, e.y, 0);
    }
  }

  updateBoss(e, dt) {
    const enraged = e.hp < e.maxHp * 0.5;
    const speedUp = enraged ? 1.45 : 1;
    e.y += (e.holdY - e.y) * Math.min(1, dt * 0.8);
    e.x = Math.sin(e.t * 0.35) * this.playHalfW * 0.55;
    if (e.y > TOP - 5) return; // still entering

    const patterns = this.d >= 3 ? ['fan', 'aimed', 'spiral', 'summon'] : ['fan', 'aimed', 'spiral'];
    e.patternT += dt;
    if (e.patternT > 4.2) {
      e.patternT = 0;
      e.pattern = (e.pattern + 1) % patterns.length;
      e.shotT = 0.6;
      if (patterns[e.pattern] === 'summon') {
        for (let i = -1; i <= 1; i++) this.spawnEnemy(this.d >= 5 ? 'kamikaze' : 'scout', e.x + i * 8, e.y - 4);
      }
    }
    if (e.patternT > 3.4) return; // breather between patterns

    const f = e.def.fire;
    const dmg = f.dmg * this.dmgMult;
    const bs = this.bulletSpeed;
    e.shotT -= dt * speedUp;
    if (e.shotT > 0) return;
    switch (patterns[e.pattern]) {
      case 'fan': {
        const n = enraged ? 13 : 9;
        const off = (Math.random() - 0.5) * 0.15;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + off + (i - (n - 1) / 2) * (1.9 / (n - 1));
          this.eShot(e.x, e.y - 5, Math.cos(a) * f.fanSpeed * bs, Math.sin(a) * f.fanSpeed * bs, dmg, 0xff66cc);
        }
        e.shotT = 0.9;
        break;
      }
      case 'aimed':
        this.aimedShot(e, f.speed * bs, dmg, 0xff66cc, (Math.random() - 0.5) * 0.25);
        e.shotT = 0.16;
        break;
      case 'spiral': {
        const arms = this.d >= 5 ? 3 : 2;
        for (let k = 0; k < arms; k++) {
          const a = e.spiralA + (k * Math.PI * 2) / arms;
          this.eShot(e.x, e.y, Math.cos(a) * f.spiralSpeed * bs, Math.sin(a) * f.spiralSpeed * bs, dmg * 0.8, 0xff3399);
        }
        e.spiralA += 0.33;
        e.shotT = 0.09;
        break;
      }
      default:
        e.shotT = 1;
    }
    this.audio.play('enemyShot');
  }

  enemyFire(e) {
    const dmg = e.def.fire.dmg * this.dmgMult;
    const bs = this.bulletSpeed;
    switch (e.type) {
      case 'scout':
        this.eShot(e.x, e.y - 2, 0, -e.def.fire.speed * bs, dmg, 0xff3366, e.def.fire.homing);
        break;
      case 'fighter':
        this.aimedShot(e, e.def.fire.speed * bs, dmg, 0xff8833, 0, e.def.fire.homing);
        break;
      case 'gunship':
        for (let k = -2; k <= 2; k++) {
          const a = -Math.PI / 2 + k * 0.22;
          this.eShot(e.x, e.y - 4, Math.cos(a) * e.def.fire.speed * bs, Math.sin(a) * e.def.fire.speed * bs, dmg, 0xbb66ff);
        }
        break;
      case 'sniper':
        e.burst = 3;
        e.burstT = 0;
        return;
    }
    this.audio.play('enemyShot');
  }

  aimedShot(e, speed, dmg, color, spread = 0, homing = 0) {
    const a = Math.atan2(this.player.y - e.y, this.player.x - e.x) + spread;
    this.eShot(e.x, e.y, Math.cos(a) * speed, Math.sin(a) * speed, dmg, color, homing);
  }

  eShot(x, y, vx, vy, dmg, color, homing = 0) {
    const mesh = homing ? flatShape('seekerShot', SEEKER_SHOT, color) : new THREE.Mesh(circleGeo, basicMat(color));
    mesh.position.set(x, y, 0.1);
    this.scene.add(mesh);
    this.eShots.push({ x, y, vx, vy, dmg, r: 0.7, mesh, color, homing, age: 0, locked: !!homing, turned: 0 });
  }

  damageEnemy(e, dmg, silent = false) {
    if (e.dead) return;
    e.hp -= dmg;
    // Continuous (beam) damage flashes periodically rather than every frame.
    if (!silent || e.t > (e.nextFlash || 0)) {
      e.flash = 0.06;
      e.nextFlash = e.t + 0.25;
      setFlash(e.mesh, true);
    }
    if (!silent) this.audio.play('hit');
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true;
    this.kills++;
    this.bounty += Math.round(e.def.bounty * this.payMult);
    if (e.type === 'boss') {
      this.bossKilled = true;
      for (let i = 0; i < 6; i++) {
        this.particles.explode(e.x + rand(-8, 8), e.y + rand(-5, 5), e.def.color, 3);
      }
      this.clearEnemyShots();
      this.shake = 4;
      this.audio.play('bigExplode');
      this.hud.banner('Capital ship destroyed', `+${Math.round(e.def.bounty * this.payMult)} cr bounty`);
    } else {
      this.particles.explode(e.x, e.y, e.def.color, e.r / 1.8);
      this.shake = Math.max(this.shake, e.r * 0.25);
      this.audio.play('explode');
    }
  }

  shootDown(h) {
    h.dead = true;
    this.particles.emit(h.x, h.y, 10, 0xffb060, { speed: 18, life: 0.35 });
    this.audio.play('hit');
  }

  clearEnemyShots() {
    for (const s of this.eShots) {
      this.particles.emit(s.x, s.y, 3, s.color, { speed: 8, life: 0.4 });
      s.dead = true;
    }
  }

  // ---------------------------------------------------------------- shots & collisions

  updateShots(dt) {
    for (const s of this.pShots) {
      s.age += dt;
      if (s.kind === 'missile') {
        if (!s.target || s.target.dead) s.target = this.nearestEnemy(s.x, s.y);
        let a = Math.atan2(s.vy, s.vx);
        const speed = Math.min(90, Math.hypot(s.vx, s.vy) + 110 * dt);
        if (s.target && s.age > 0.15) {
          const want = Math.atan2(s.target.y - s.y, s.target.x - s.x);
          let diff = want - a;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          a += clamp(diff, -6 * dt, 6 * dt);
        } else if (s.age > 0.15) {
          a += clamp(Math.PI / 2 - a, -3 * dt, 3 * dt);
        }
        s.vx = Math.cos(a) * speed;
        s.vy = Math.sin(a) * speed;
        s.mesh.rotation.z = a - Math.PI / 2;
        if (Math.random() < 0.7) this.particles.emit(s.x, s.y, 1, 0xff66ff, { speed: 4, life: 0.35 });
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.mesh.position.set(s.x, s.y, 0.1);
      if ((s.life && s.age > s.life) || s.y > TOP + 5 || s.y < BOTTOM - 5 || Math.abs(s.x) > this.halfW + 5) s.dead = true;
    }
    const p = this.player;
    for (const s of this.eShots) {
      if (s.homing) {
        s.age += dt;
        if (s.age > HOMING_SHOT_LIFE) {
          this.particles.emit(s.x, s.y, 5, s.color, { speed: 8, life: 0.4 });
          s.dead = true;
          continue;
        }
        // Steer toward the player at a limited turn rate; dead pilots aren't tracked.
        // Once a shot has turned a full circle in total, it loses its lock and flies straight.
        let a = Math.atan2(s.vy, s.vx);
        if (s.locked && this.phase !== 'dead') {
          const want = Math.atan2(p.y - s.y, p.x - s.x);
          const diff = Math.atan2(Math.sin(want - a), Math.cos(want - a));
          const turn = clamp(diff, -s.homing * dt, s.homing * dt);
          a += turn;
          s.turned += Math.abs(turn);
          if (s.turned >= Math.PI * 2) {
            s.locked = false;
            s.mesh.material.color.multiplyScalar(0.45);
            this.particles.emit(s.x, s.y, 4, s.color, { speed: 6, life: 0.3 });
          }
        }
        const sp = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(a) * sp;
        s.vy = Math.sin(a) * sp;
        s.mesh.rotation.z = a - Math.PI / 2;
        if (s.locked && Math.random() < 0.6) this.particles.emit(s.x, s.y, 1, s.color, { speed: 3, life: 0.3 });
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.mesh.position.set(s.x, s.y, 0.1);
      const m = s.locked ? 30 : 3; // locked homing shots may swing offscreen and curve back
      if (s.y < BOTTOM - m || s.y > TOP + 12 + m || Math.abs(s.x) > this.halfW + m) s.dead = true;
    }
  }

  nearestEnemy(x, y) {
    let best = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.y > TOP) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  collide() {
    const p = this.player;
    for (const s of this.pShots) {
      if (s.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || e.y > TOP + 2) continue;
        const rr = e.r + s.r;
        if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 < rr * rr) {
          s.dead = true;
          this.damageEnemy(e, s.dmg);
          this.particles.emit(s.x, s.y, 3, s.color, { speed: 15, life: 0.25 });
          break;
        }
      }
      if (s.dead) continue;
      // Homing shots are missiles and can be shot down; plain shots can't.
      for (const h of this.eShots) {
        if (h.dead || !h.homing) continue;
        const rr = h.r + s.r;
        if ((h.x - s.x) ** 2 + (h.y - s.y) ** 2 < rr * rr) {
          s.dead = true;
          this.shootDown(h);
          break;
        }
      }
    }
    if (this.phase === 'dead') return;
    for (const s of this.eShots) {
      if (s.dead) continue;
      const rr = PLAYER_R + s.r;
      if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 < rr * rr) {
        s.dead = true;
        this.hitPlayer(s.dmg);
        continue;
      }
      for (const h of this.helpers.values()) {
        if (h.respawn > 0) continue;
        const er = ESCORT_R + s.r;
        if ((h.x - s.x) ** 2 + (h.y - s.y) ** 2 < er * er) {
          s.dead = true;
          this.hitEscort(h, s.dmg);
          break;
        }
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const rr = PLAYER_R + e.r * 0.8;
      if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < rr * rr) {
        const wasInvuln = p.invuln > 0;
        this.hitPlayer(e.def.contact * this.dmgMult);
        if (e.type === 'kamikaze') this.killEnemy(e);
        else if (!wasInvuln) this.damageEnemy(e, e.type === 'boss' ? 0 : 40 * this.hpMult);
        continue;
      }
      for (const h of this.helpers.values()) {
        if (h.respawn > 0) continue;
        const er = ESCORT_R + e.r * 0.8;
        if ((h.x - e.x) ** 2 + (h.y - e.y) ** 2 < er * er) {
          const wasInvuln = h.invuln > 0;
          this.hitEscort(h, e.def.contact * this.dmgMult);
          if (e.type === 'kamikaze') this.killEnemy(e);
          else if (!wasInvuln && e.type !== 'boss') this.damageEnemy(e, 24 * this.hpMult);
          break;
        }
      }
    }
  }

  cleanup() {
    const W = this.halfW + 25;
    const keep = (list, dispose) =>
      list.filter((o) => {
        if (o.dead) {
          this.scene.remove(o.mesh);
          dispose?.(o);
          return false;
        }
        return true;
      });
    // Hostiles can't escape: anything that leaves the screen comes back in from the top
    // for another pass. Only asteroids (obstacles) drift away for good.
    for (const e of this.enemies) {
      if (e.dead || e.type === 'boss') continue;
      const gone = e.y < BOTTOM - 10 || Math.abs(e.x) > W || (e.t > 3 && e.y > SPAWN_Y + 15);
      if (!gone) continue;
      if (e.type === 'asteroid') e.dead = true;
      else this.reenter(e);
    }
    this.enemies = keep(this.enemies, (e) => disposeModel(e.mesh));
    this.pShots = keep(this.pShots, (s) => s.kind === 'missile' && s.mesh.material.dispose());
    this.eShots = keep(this.eShots, (s) => s.homing && s.mesh.material.dispose());
  }

  reenter(e) {
    e.x = e.baseX = rand(-this.playHalfW * 0.8, this.playHalfW * 0.8);
    e.y = SPAWN_Y;
    e.t = 0;
    e.locked = false; // kamikazes line up a fresh dive
  }

  isHostile(e) {
    return !e.dead && e.type !== 'asteroid';
  }

  hostilesLeft() {
    return this.enemies.filter((e) => this.isHostile(e)).length + this.spawnQueue.filter((q) => q.type !== 'asteroid').length;
  }

  // ---------------------------------------------------------------- arrival

  // Route clear: the ship punches forward toward the destination; docking itself
  // is the separate DockView mini-game.
  startOutro() {
    if (this.phase === 'outro') return;
    this.setPhase('outro');
    this.clearEnemyShots();
    this.beamMesh.visible = false;
    this.audio.beam(false);
    this.hud.banner('Route clear', `Approaching ${this.toName}`);
    this.outroV = 0;
  }

  updateOutro(dt) {
    const p = this.player;
    if (this.phaseT > 1.4) {
      this.outroV += 110 * dt;
      p.y += this.outroV * dt;
      p.x *= 1 - Math.min(1, dt * 1.5);
      this.particles.emit(p.x, p.y - 3.4, 3, 0xffb060, { speed: 10, angle: -Math.PI / 2, spread: 0.4, life: 0.5 });
    }
    if (this.phaseT > 3.2) this.finish({ success: true });
  }

  finish(result) {
    if (this.done) return;
    this.done = true;
    this.audio.beam(false);
    this.app.party?.setMode('wait');
    this.onDone({ ...result, hull: this.player.hull, bounty: this.bounty, kills: this.kills, bossKilled: this.bossKilled, weapon: this.player.weapon });
  }

  dispose() {
    this.done = true;
    this.app.party?.setMode('wait');
    this.input.captureKeys = false;
    this.audio.beam(false);
    this.hud.destroy();
    this.stars.dispose();
    this.particles.dispose();
    this.scene.traverse((o) => {
      disposeModel(o);
    });
  }
}
