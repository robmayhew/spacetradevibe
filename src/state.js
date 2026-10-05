import { SYSTEMS, SHIPS, WEAPONS, WEAPON_ORDER, WEAPON_MODS, GOODS, COST_GROWTH, PAY_GROWTH, ESCORT_BAY, WEAPON_MAX_LEVEL, canMountWeapon, weaponLevelMult, weaponRateMult } from './data.js';
import { applyPersistentUnlocks, hasShipUnlock, hasWeaponUnlock } from './achievements.js';
import { paceMatchingEnabled, loadPrefs, savePrefs } from './prefs.js';
import { routeDifficulty, systemDistance } from './galaxy.js';
import { shuffle, pick, rand } from './rng.js';

const SAVE_KEY = 'txl-trader-save-v1';
const SLOTS_KEY = 'txl-trader-saves-v1';
const CALLSIGN_KEY = 'txl-trader-callsign';
export const MAX_SLOTS = 3;

function newRunId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function newState(galaxy) {
  const s = {
    version: 1,
    seed: galaxy.seed,
    runId: newRunId(),
    runMs: 0,
    credits: 60,
    current: galaxy.start,
    visited: [galaxy.start],
    upgrades: Object.fromEntries(Object.entries(SYSTEMS).map(([k, sys]) => [k, sys.start])),
    ship: 'hauler',
    weapons: ['pulse'],
    weapon: 'pulse',
    weaponLevels: { pulse: 1 },
    mounts: [],
    escort: emptyEscort(),
    hull: SYSTEMS.hull.value(1),
    contracts: [],
    won: false,
    recentFlights: [],
    stats: { deliveries: 0, kills: 0, deaths: 0, earned: 0, bosses: 0, flights: 0 },
    paced: paceMatchingEnabled(),
    paceLast: 1,
    paceAvg: 1,
    paceN: 0,
    pacePeak: 1,
    heat: startingHeat(),
  };
  applyPersistentUnlocks(s);
  s.hull = shipStats(s).maxHull;
  return s;
}

export function hullDef(state) {
  return SHIPS[state?.ship] || SHIPS.hauler;
}

export function shipStats(state) {
  const u = state.upgrades;
  const hull = hullDef(state);
  const maxShieldBase = SYSTEMS.shield.value(u.shield);
  return {
    dmgMult: SYSTEMS.core.value(u.core) * (hull.dmgMult || 1),
    maxHull: Math.round(SYSTEMS.hull.value(u.hull) * (hull.hullMult || 1)),
    maxShield: maxShieldBase ? Math.round(maxShieldBase * (hull.shieldMult || 1)) : 0,
    speed: SYSTEMS.engine.value(u.engine) * (hull.speedMult || 1),
    cargo: SYSTEMS.cargo.value(u.cargo),
    fireRate: hull.fireRate || 1,
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
  const max = shipStats(state).maxHull;
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
        good = { name: 'KL9 Shutdown Code', base: 60 };
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

export function extraMountSlots(state) {
  return Math.max(0, (state.upgrades?.hardpoints || 1) - 1);
}

export function extraMounts(state) {
  const slots = extraMountSlots(state);
  const mounts = Array.isArray(state.mounts) ? state.mounts : [];
  return mounts.slice(0, slots).filter((id) => id && hasWeapon(state, id) && canMountWeapon(id));
}

export function primaryWeapons(state) {
  const mounted = extraMounts(state);
  return WEAPON_ORDER.filter((id) => hasWeapon(state, id) && !mounted.includes(id));
}

export function ensurePrimaryWeapon(state) {
  const primaries = primaryWeapons(state);
  if (!primaries.length) return false;
  if (!primaries.includes(state.weapon)) state.weapon = primaries[0];
  return true;
}

export function weaponLevel(state, id) {
  const n = state.weaponLevels?.[id];
  return Math.max(1, Math.min(WEAPON_MAX_LEVEL, Number.isInteger(n) ? n : 1));
}

export function weaponLevelCost(state, id) {
  if (!hasWeapon(state, id)) return null;
  const lvl = weaponLevel(state, id);
  if (lvl >= WEAPON_MAX_LEVEL) return null;
  const base = Math.max(180, Math.round((WEAPONS[id]?.cost || 0) * 0.35) || 180);
  return Math.round(base * Math.pow(COST_GROWTH, lvl - 1));
}

export function buyWeaponLevel(state, id) {
  const cost = weaponLevelCost(state, id);
  if (cost == null || state.credits < cost) return false;
  state.credits -= cost;
  if (!state.weaponLevels) state.weaponLevels = {};
  state.weaponLevels[id] = weaponLevel(state, id) + 1;
  return true;
}

export function setMount(state, index, id) {
  const slots = extraMountSlots(state);
  if (index < 0 || index >= slots) return false;
  if (!Array.isArray(state.mounts)) state.mounts = [];
  while (state.mounts.length < slots) state.mounts.push(null);
  if (!id) {
    state.mounts[index] = null;
    return true;
  }
  if (!hasWeapon(state, id) || !canMountWeapon(id)) return false;
  if (state.mounts.some((m, i) => i !== index && m === id)) return false;
  const prev = state.mounts[index];
  state.mounts[index] = id;
  if (!ensurePrimaryWeapon(state)) {
    state.mounts[index] = prev;
    return false;
  }
  return true;
}

export function escortLevel(state, key) {
  const def = ESCORT_BAY[key];
  const n = state.escort?.[key];
  if (!def) return 1;
  const start = def.start;
  return Math.max(start, Math.min(def.max, Number.isInteger(n) ? n : start));
}

export function escortUpgradeCost(state, key) {
  const def = ESCORT_BAY[key];
  if (!def) return null;
  const level = escortLevel(state, key);
  if (level >= def.max) return null;
  return Math.round(def.baseCost * Math.pow(COST_GROWTH, level - def.start));
}

export function buyEscortUpgrade(state, key) {
  const cost = escortUpgradeCost(state, key);
  if (cost == null || state.credits < cost) return false;
  state.credits -= cost;
  if (!state.escort) state.escort = emptyEscort();
  state.escort[key] = escortLevel(state, key) + 1;
  return true;
}

export function escortStats(state) {
  return {
    maxHull: ESCORT_BAY.hull.value(escortLevel(state, 'hull')),
    dmgFrac: ESCORT_BAY.core.value(escortLevel(state, 'core')),
    speedMult: ESCORT_BAY.engine.value(escortLevel(state, 'engine')),
    rate: ESCORT_BAY.rate.value(escortLevel(state, 'rate')),
  };
}

function emptyEscort() {
  return Object.fromEntries(Object.entries(ESCORT_BAY).map(([k, def]) => [k, def.start]));
}

function normalizeLoadout(s) {
  if (!s.upgrades || typeof s.upgrades !== 'object') s.upgrades = {};
  for (const [k, def] of Object.entries(SYSTEMS)) {
    const n = s.upgrades[k];
    if (!Number.isInteger(n)) s.upgrades[k] = def.start;
    else s.upgrades[k] = Math.max(def.start, Math.min(def.max, n));
  }
  if (!Array.isArray(s.mounts)) s.mounts = [];
  s.mounts = s.mounts.map((id) => (canMountWeapon(id) ? id : null));
  const slots = extraMountSlots(s);
  s.mounts = s.mounts.slice(0, slots);
  ensurePrimaryWeapon(s);
  if (!s.weaponLevels || typeof s.weaponLevels !== 'object') s.weaponLevels = {};
  for (const id of s.weapons || []) {
    if (!Number.isInteger(s.weaponLevels[id])) s.weaponLevels[id] = 1;
  }
  if (!s.escort || typeof s.escort !== 'object') s.escort = emptyEscort();
  for (const [k, def] of Object.entries(ESCORT_BAY)) {
    const n = s.escort[k];
    if (!Number.isInteger(n)) s.escort[k] = def.start;
    else s.escort[k] = Math.max(def.start, Math.min(def.max, n));
  }
}

export function weaponTuneStat(id, level) {
  const w = WEAPONS[id];
  if (!w) return '';
  const dm = weaponLevelMult(level);
  const rm = weaponRateMult(level);
  if (w.kind === 'beam') return `${Math.round((w.dps || 100) * dm)} dps`;
  const dmg = Math.round((w.dmg || 0) * dm * 10) / 10;
  const rate = Math.round((w.rate || 1) * rm * 10) / 10;
  return `${dmg} dmg · ${rate}/s`;
}

export function hasWeapon(state, id) {
  return state.weapons.includes(id);
}

// Special weapon mods (e.g. Seeker Rapid Recharge), stored apart from the generic weaponLevels.
export function weaponModLevel(state, id) {
  return state.weaponMods?.[id] ?? WEAPON_MODS[id].start;
}

export function weaponModCost(id, level) {
  const u = WEAPON_MODS[id];
  if (level >= u.max) return null;
  return u.costs?.[level + 1] ?? Math.round(u.baseCost * Math.pow(COST_GROWTH, level - u.start));
}

export function buyWeaponMod(state, id) {
  if (!hasWeapon(state, id)) return false;
  const level = weaponModLevel(state, id);
  const cost = weaponModCost(id, level);
  if (cost == null || state.credits < cost) return false;
  state.credits -= cost;
  state.weaponMods = { ...state.weaponMods, [id]: level + 1 };
  return true;
}

export function buyWeapon(state, id) {
  const w = WEAPONS[id];
  if (!w || hasWeapon(state, id) || !hasWeaponUnlock(id) || state.credits < w.cost) return false;
  state.credits -= w.cost;
  state.weapons.push(id);
  if (!state.weaponLevels) state.weaponLevels = {};
  if (!state.weaponLevels[id]) state.weaponLevels[id] = 1;
  return true;
}

export function selectShip(state, id) {
  if (!SHIPS[id] || !hasShipUnlock(id)) return false;
  const before = shipStats(state);
  const full = state.hull >= before.maxHull - 0.5;
  state.ship = id;
  const after = shipStats(state);
  state.hull = full ? after.maxHull : Math.min(Math.max(1, state.hull), after.maxHull);
  return true;
}

export function recordFlight(state, result) {
  const maxHull = shipStats(state).maxHull;
  const kind = result.success ? 'success' : result.retreat ? 'retreat' : 'death';
  const hullFrac = kind === 'death' ? 0 : maxHull > 0 ? Math.max(0, Math.min(1, (result.hull ?? 0) / maxHull)) : 1;
  const waves = Math.max(1, Number(result.waves) || 1);
  const combatMs = Math.max(0, Number(result.combatMs) || 0);
  const recent = Array.isArray(state.recentFlights) ? state.recentFlights : [];
  state.recentFlights = [...recent, { kind, hullFrac, combatMs, waves }].slice(-6);
}

export function pacePressure(state) {
  if (!paceMatchingEnabled()) return 1;
  const flights = state.stats?.flights || 0;
  const recent = state.recentFlights || [];
  let p = 1;
  if (recent.length) {
    let score = 0;
    for (const f of recent) {
      if (f.kind === 'death') score -= 1;
      else if (f.kind === 'retreat') score -= 0.6;
      else if (f.kind === 'success') {
        if (f.hullFrac >= 0.6) score += 0.5;
        if (f.hullFrac < 0.35) score -= 0.4;
        const waves = Math.max(1, Number(f.waves) || 1);
        const expected = waves * 20000;
        const ms = Number(f.combatMs) || 0;
        if (ms > 0 && ms < expected * 0.65) score += 0.45;
        else if (ms > 0 && ms < expected * 0.85) score += 0.22;
      }
    }
    p = 1 + (score / recent.length) * 0.4;
  }
  p = Math.max(0.75, Math.min(1.2, p));
  if (flights < 2) p = Math.min(p, 0.9);
  return p;
}

export function recordPace(state, pressure) {
  const on = state?.paced !== false && paceMatchingEnabled();
  const p = on ? Math.max(0.75, Math.min(1.2, Number(pressure) || 1)) : 1;
  state.paceLast = p;
  const n = Number(state.paceN) || 0;
  state.paceAvg = n ? (state.paceAvg * n + p) / (n + 1) : p;
  state.paceN = n + 1;
  if (!Number.isFinite(state.pacePeak) || p > state.pacePeak) state.pacePeak = p;
}

export function formatPace(pressure, on = true) {
  if (!on) return 'Off';
  const p = Number(pressure);
  if (!Number.isFinite(p)) return '×1.00';
  return `×${p.toFixed(2)}`;
}

export function startingHeat() {
  return Math.max(0, Math.min(3, Math.round(Number(loadPrefs().laneHeat) || 0)));
}

export function heatLevel(state) {
  return Math.max(0, Math.min(3, Math.round(Number(state?.heat) || 0)));
}

export function heatMult(state) {
  return 1 + 0.12 * heatLevel(state);
}

export function formatHeat(state) {
  const n = heatLevel(state);
  return n ? `+${n}` : '';
}

// After a Terminus clear, later flights and new saves on this device run hotter.
// A short or deathless first clear stacks more heat (cap 3).
export function recordTerminusClear(state) {
  const short = (state.stats?.deliveries || 0) < 18;
  const clean = (state.stats?.deaths || 0) === 0;
  const bump = Math.min(3, 1 + (short ? 1 : 0) + (clean ? 1 : 0));
  state.heat = Math.max(heatLevel(state), bump);
  const prefs = loadPrefs();
  savePrefs({
    terminusWins: (prefs.terminusWins || 0) + 1,
    laneHeat: Math.max(prefs.laneHeat || 0, short || clean ? Math.min(3, 2) : 1),
  });
  return state.heat;
}

export function paceForBoard(state) {
  if (state?.paced === false) return 100;
  const p = Number(state?.paceAvg || state?.paceLast || 1);
  return Math.round((Number.isFinite(p) ? p : 1) * 100);
}

export function buyUpgrade(state, key) {
  const cost = upgradeCost(key, state.upgrades[key]);
  if (cost == null || state.credits < cost) return false;
  const before = shipStats(state);
  state.credits -= cost;
  state.upgrades[key]++;
  if (key === 'hull') state.hull += shipStats(state).maxHull - before.maxHull;
  if (key === 'hardpoints') {
    const slots = extraMountSlots(state);
    if (Array.isArray(state.mounts)) state.mounts = state.mounts.slice(0, slots);
  }
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
  const bank = loadBank();
  const i = Number.isInteger(bank.active) ? bank.active : 0;
  bank.slots[i] = state;
  persistBank(bank);
}

function migrateSave(s) {
  if (!s || typeof s !== 'object') return null;
  if (!SHIPS[s.ship]) s.ship = 'hauler';
  if (!Array.isArray(s.recentFlights)) s.recentFlights = [];
  if (s.paced !== false) s.paced = true;
  if (!Number.isFinite(s.paceLast)) s.paceLast = 1;
  if (!Number.isFinite(s.paceAvg)) s.paceAvg = s.paceLast;
  if (!Number.isInteger(s.paceN) || s.paceN < 0) s.paceN = 0;
  if (!Number.isFinite(s.pacePeak)) s.pacePeak = s.paceLast;
  if (!Number.isInteger(s.heat) || s.heat < 0) s.heat = 0;
  s.heat = Math.max(0, Math.min(3, s.heat));
  if (!s.upgrades || typeof s.upgrades !== 'object') s.upgrades = {};
  for (const [k, def] of Object.entries(SYSTEMS)) {
    if (!Number.isInteger(s.upgrades[k])) s.upgrades[k] = def.start;
  }
  if (!Array.isArray(s.weapons) || !s.weapons.length) s.weapons = ['pulse'];
  normalizeLoadout(s);
  if (!s.callsign) {
    try {
      s.callsign = localStorage.getItem(CALLSIGN_KEY) || '';
    } catch {
      s.callsign = '';
    }
  }
  applyPersistentUnlocks(s);
  return s;
}

function emptyBank() {
  return { slots: [null, null, null], active: 0 };
}

function loadBank() {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const slots = Array.from({ length: MAX_SLOTS }, (_, i) => migrateSave(data.slots?.[i] || null));
      let active = Number.isInteger(data.active) ? data.active : 0;
      if (active < 0 || active >= MAX_SLOTS) active = 0;
      return { slots, active };
    }
  } catch {
    // ignore and try the old single-save key
  }
  let legacy = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) legacy = migrateSave(JSON.parse(raw));
  } catch {
    legacy = null;
  }
  const bank = emptyBank();
  if (legacy) {
    bank.slots[0] = legacy;
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
    persistBank(bank);
  }
  return bank;
}

function persistBank(bank) {
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(bank));
  } catch {
    // storage unavailable (private mode, quota); the game still plays
  }
}

export function listSlots() {
  const { slots, active } = loadBank();
  return slots.map((s, index) =>
    s
      ? {
          index,
          empty: false,
          active: index === active,
          callsign: s.callsign || 'Trader',
          credits: s.credits ?? 0,
          won: !!s.won,
        }
      : { index, empty: true, active: index === active, callsign: '', credits: 0, won: false },
  );
}

export function occupiedSlots() {
  return listSlots().filter((s) => !s.empty);
}

export function freeSlotIndex() {
  const row = listSlots().find((s) => s.empty);
  return row ? row.index : -1;
}

export function peekSlot(index) {
  const { slots } = loadBank();
  return slots[index] || null;
}

export function setActiveSlot(index) {
  const bank = loadBank();
  if (index < 0 || index >= MAX_SLOTS || !bank.slots[index]) return null;
  bank.active = index;
  persistBank(bank);
  return bank.slots[index];
}

export function writeActive(state, index) {
  const bank = loadBank();
  const i = index ?? bank.active;
  if (i < 0 || i >= MAX_SLOTS) return;
  bank.slots[i] = state;
  bank.active = i;
  persistBank(bank);
}

export function load(index) {
  if (Number.isInteger(index)) return setActiveSlot(index);
  const bank = loadBank();
  if (bank.slots[bank.active]) return bank.slots[bank.active];
  const first = bank.slots.findIndex(Boolean);
  if (first < 0) return null;
  bank.active = first;
  persistBank(bank);
  return bank.slots[first];
}

export function clearSave(index) {
  const bank = loadBank();
  const i = Number.isInteger(index) ? index : bank.active;
  if (i < 0 || i >= MAX_SLOTS) return;
  bank.slots[i] = null;
  if (bank.active === i) {
    const next = bank.slots.findIndex(Boolean);
    bank.active = next < 0 ? 0 : next;
  }
  persistBank(bank);
}
