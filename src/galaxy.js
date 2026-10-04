import { RNG } from './rng.js';
import { SYSTEMS } from './data.js';

export const TIERS = 10;
const PER_TIER = 3;
const COL_W = 90;
const HEIGHT = 160;
const MIN_SPACING = 36;
const MAX_LINKS = 3;
const MAX_LINK_DIST = 140;
const LOOP_LINK_DIST = 120;

const SYL_A = ['Ka', 'Ve', 'Or', 'Zan', 'Tel', 'Myr', 'Ax', 'Cor', 'Dra', 'Eos', 'Fal', 'Gor', 'Hel', 'Ix', 'Jor', 'Kel', 'Lum', 'Nov', 'Pyr', 'Quin', 'Rho', 'Sol', 'Tyr', 'Ul', 'Vex', 'Xan', 'Yra', 'Zeph', 'Ar', 'Bel', 'Cy', 'Nym', 'Os', 'Pra', 'Sy', 'Thal'];
const SYL_B = ['ra', 'on', 'is', 'ex', 'ia', 'us', 'or', 'an', 'eth', 'ul', 'ys', 'ar', 'iel', 'os', 'ion', 'ax', 'ene', 'ium', 'ara', 'ette'];
const SUFFIX = ['', '', '', '', ' Prime', ' II', ' III', ' IV', ' Reach', ' Gate', ' Outpost', ' Hub', ' Point', ' Major', ' Minor', ' Drift', ' Deep', ' Station'];

function makeName(rng, used) {
  for (;;) {
    let n = rng.pick(SYL_A) + rng.pick(SYL_B);
    if (rng.chance(0.35)) n += rng.pick(SYL_B);
    n += rng.pick(SUFFIX);
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
}

export function systemDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// 30 systems laid out left→right in 10 difficulty tiers of 3, plus the Terminus
// (the win condition) at the far right. Links only join the same or adjacent
// tiers, so route difficulty climbs gradually.
export function generateGalaxy(seed) {
  const rng = new RNG(seed);
  const used = new Set();
  const systems = [];

  for (let t = 1; t <= TIERS; t++) {
    for (let k = 0; k < PER_TIER; k++) {
      let x, y;
      for (let attempt = 0; attempt < 300; attempt++) {
        x = (t - 1) * COL_W + rng.float(8, COL_W - 8);
        y = rng.float(-HEIGHT / 2, HEIGHT / 2);
        if (systems.every((s) => Math.hypot(s.x - x, s.y - y) >= MIN_SPACING)) break;
      }
      systems.push({ id: systems.length, name: makeName(rng, used), x, y, tier: t, links: [] });
    }
  }
  const end = systems.length;
  systems.push({ id: end, name: 'Terminus', x: TIERS * COL_W + 25, y: 0, tier: TIERS, links: [], terminus: true });

  const start = systems.filter((s) => s.tier === 1).reduce((a, b) => (b.x < a.x ? b : a)).id;

  // Degree-capped Kruskal spanning tree, then patch connectivity, then add loops.
  const parent = systems.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const deg = systems.map(() => 0);
  const linked = (i, j) => systems[i].links.includes(j);
  const link = (i, j) => {
    systems[i].links.push(j);
    systems[j].links.push(i);
    deg[i]++;
    deg[j]++;
    parent[find(i)] = find(j);
  };

  const pairs = [];
  for (let i = 0; i < systems.length; i++) {
    for (let j = i + 1; j < systems.length; j++) {
      if (Math.abs(systems[i].tier - systems[j].tier) > 1) continue;
      pairs.push({ i, j, d: systemDistance(systems[i], systems[j]) });
    }
  }
  pairs.sort((a, b) => a.d - b.d);

  for (const p of pairs) {
    if (p.d > MAX_LINK_DIST) break;
    if (find(p.i) !== find(p.j) && deg[p.i] < MAX_LINKS && deg[p.j] < MAX_LINKS) link(p.i, p.j);
  }
  for (const p of pairs) {
    if (find(p.i) !== find(p.j)) link(p.i, p.j);
  }
  for (let i = 0; i < systems.length; i++) {
    if (deg[i] >= 2 && !(deg[i] === 2 && rng.chance(0.3))) continue;
    const cand = pairs.find(
      (p) => (p.i === i || p.j === i) && p.d < LOOP_LINK_DIST && !linked(p.i, p.j) && deg[p.i] < MAX_LINKS && deg[p.j] < MAX_LINKS,
    );
    if (cand) link(cand.i, cand.j);
  }

  return { seed, systems, start, end };
}

export function scanRange(state) {
  const def = SYSTEMS.scanner;
  const lvl = Number.isInteger(state?.upgrades?.scanner) ? state.upgrades.scanner : def.start;
  return Math.max(1, def.value(lvl));
}

// Visited stations plus systems within scanner range. Everything else stays off the map.
export function revealedSystems(galaxy, state) {
  const sys = galaxy?.systems || [];
  const range = scanRange(state);
  const dist = new Map();
  const queue = [];
  const add = (id, d) => {
    if (!sys[id] || dist.has(id)) return;
    dist.set(id, d);
    queue.push(id);
  };
  for (const id of state?.visited || []) add(id, 0);
  add(state?.current, 0);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const d = dist.get(id);
    if (d >= range) continue;
    for (const l of sys[id].links) add(l, d + 1);
  }
  for (const c of state?.contracts || []) add(c.dest, 0);
  return new Set(dist.keys());
}

export function routeDifficulty(galaxy, a, b) {
  return Math.max(galaxy.systems[a].tier, galaxy.systems[b].tier);
}
