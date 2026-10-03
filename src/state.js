import { SYSTEMS, WEAPONS, GOODS, COST_GROWTH, PAY_GROWTH } from './data.js';
import { routeDifficulty, systemDistance } from './galaxy.js';
import { shuffle, pick, rand } from './rng.js';

const SAVE_KEY = 'txl-trader-save-v1';

function newRunId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function newState(galaxy) {
  return {
    version: 1,
    seed: galaxy.seed,
    runId: newRunId(),
    runMs: 0,
    credits: 60,
    current: galaxy.start,
    visited: [galaxy.start],
    upgrades: Object.fromEntries(Object.entries(SYSTEMS).map(([k, s]) => [k, s.start])),
    weapons: ['pulse'],
    weapon: 'pulse',
    hull: SYSTEMS.hull.value(1),
    contracts: [],
    won: false,
    stats: { deliveries: 0, kills: 0, deaths: 0, earned: 0, bosses: 0, flights: 0 },
  };
}

export function shipStats(state) {
  const u = state.upgrades;
  return {
    dmgMult: SYSTEMS.core.value(u.core),
    maxHull: SYSTEMS.hull.value(u.hull),
    maxShield: SYSTEMS.shield.value(u.shield),
    speed: SYSTEMS.engine.value(u.engine),
    cargo: SYSTEMS.cargo.value(u.cargo),
  };
}

// Average of the three combat systems; shield starts at 0 so it counts as +1.
// Routes above the rating can still be flown; they're just rated more dangerous.
export function shipRating(state) {
  const u = state.upgrades;
  return Math.min(10, Math.floor((u.core + u.hull + u.shield + 1) / 3));
}

const DANGER = [
  { label: 'Low', color: '#8fbf5a' },
  { label: 'Moderate', color: '#e8c767' },
  { label: 'High', color: '#f2a541' },
  { label: 'Extreme', color: '#d0453a' },
  { label: 'Suicidal', color: '#ff2e2e' },
];

// Danger of a route for this ship: how far its difficulty sits above the ship rating.
export function routeDanger(difficulty, rating) {
  const level = Math.max(0, Math.min(DANGER.length - 1, difficulty - rating + 1));
  return { level, ...DANGER[level] };
}

export function upgradeCost(key, level) {
  const s = SYSTEMS[key];
  if (level >= s.max) return null;
  return Math.round(s.baseCost * Math.pow(COST_GROWTH, level - s.start));
}

export function repairCost(state) {
  const max = SYSTEMS.hull.value(state.upgrades.hull);
  const missing = Math.max(0, max - state.hull) / max;
  return Math.ceil(missing * 50 * Math.pow(PAY_GROWTH, state.upgrades.hull - 1));
}

export function towFee(state, difficulty) {
  return Math.min(state.credits, Math.round(40 * Math.pow(PAY_GROWTH, difficulty - 1)));
}

export function generateContracts(state, galaxy) {
  const here = galaxy.systems[state.current];
  const dests = shuffle([...here.links]).slice(0, 3);
  state.contracts = dests
    .map((id) => {
      const dest = galaxy.systems[id];
      const difficulty = routeDifficulty(galaxy, here.id, id);
      const dist = systemDistance(here, dest);
      let good;
      if (dest.terminus) {
        good = { name: 'Founders’ Beacon', base: 60 };
      } else {
        good = pick(GOODS.filter((g) => g.tier <= difficulty && g.tier >= difficulty - 2));
      }
      const pay = Math.round(1.6 * good.base * Math.pow(PAY_GROWTH, difficulty - 1) * rand(0.85, 1.2) * (1 + dist / 300));
      // 1 wave on the easiest routes, up to 4 on the hardest.
      const waves = Math.max(1, Math.min(4, Math.round(1 + ((difficulty - 1) * 3) / 9 + rand(-0.7, 0.7))));
      return { dest: id, difficulty, good: good.name, pay, dist: Math.round(dist), waves };
    })
    .sort((a, b) => a.difficulty - b.difficulty || b.pay - a.pay);
}

export function hasWeapon(state, id) {
  return state.weapons.includes(id);
}

export function buyWeapon(state, id) {
  const w = WEAPONS[id];
  if (hasWeapon(state, id) || state.credits < w.cost) return false;
  state.credits -= w.cost;
  state.weapons.push(id);
  return true;
}

export function buyUpgrade(state, key) {
  const cost = upgradeCost(key, state.upgrades[key]);
  if (cost == null || state.credits < cost) return false;
  const before = shipStats(state);
  state.credits -= cost;
  state.upgrades[key]++;
  if (key === 'hull') state.hull += shipStats(state).maxHull - before.maxHull;
  return true;
}

export function repair(state) {
  const cost = repairCost(state);
  if (cost === 0 || state.credits < cost) return false;
  state.credits -= cost;
  state.hull = shipStats(state).maxHull;
  return true;
}

export function save(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode, quota); the game still plays
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
