import { SHIPS, SHIP_ORDER, WEAPONS, WEAPON_ORDER, SYSTEMS } from './data.js';

const META_KEY = 'txl-trader-meta';

export const ACHIEVEMENTS = {
  first_flight: {
    name: 'Clear for departure',
    hint: 'Finish your first flight.',
    test: (s) => s.stats.flights >= 1,
  },
  first_kill: {
    name: 'First blood',
    hint: 'Destroy a hostile.',
    test: (s) => s.stats.kills >= 1,
  },
  courier: {
    name: 'Paid in full',
    hint: SHIPS.courier.hint,
    ship: 'courier',
    test: (s) => s.stats.deliveries >= 1,
  },
  skirmisher: {
    name: 'Lane regular',
    hint: SHIPS.skirmisher.hint,
    ship: 'skirmisher',
    test: (s) => s.stats.deliveries >= 3,
  },
  bulwark: {
    name: 'Limping in',
    hint: SHIPS.bulwark.hint,
    ship: 'bulwark',
    test: (s, ctx) => !!(ctx.result?.success && ctx.hullFrac < 0.5),
  },
  lance: {
    name: 'Gunner',
    hint: SHIPS.lance.hint,
    ship: 'lance',
    test: (s) => s.stats.kills >= 25,
  },
  marauder: {
    name: 'Capital prize',
    hint: SHIPS.marauder.hint,
    ship: 'marauder',
    test: (s) => s.stats.bosses >= 1,
  },
  pathfinder: {
    name: 'Charted lanes',
    hint: SHIPS.pathfinder.hint,
    ship: 'pathfinder',
    test: (s) => (s.visited?.length || 0) >= 15,
  },
  sovereign: {
    name: 'Edge of known space',
    hint: SHIPS.sovereign.hint,
    ship: 'sovereign',
    test: (s) => !!s.won,
  },
  wraith: {
    name: 'Ghost run',
    hint: SHIPS.wraith.hint,
    ship: 'wraith',
    test: (s) => !!s.won && s.stats.deaths === 0,
  },
  nova: {
    name: 'Overkill',
    hint: 'Destroy 75 hostiles.',
    weapon: 'nova',
    test: (s) => s.stats.kills >= 75,
  },
};

export const ACHIEVEMENT_ORDER = [
  'first_flight', 'first_kill', 'courier', 'skirmisher', 'bulwark',
  'lance', 'marauder', 'pathfinder', 'sovereign', 'wraith', 'nova',
];

function emptyMeta() {
  return { version: 1, achievements: [], ships: ['hauler'], weapons: [] };
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const base = emptyMeta();
    if (!parsed || typeof parsed !== 'object') return base;
    const ships = Array.isArray(parsed.ships) ? parsed.ships.filter((id) => SHIPS[id]) : [];
    if (!ships.includes('hauler')) ships.unshift('hauler');
    const achievements = Array.isArray(parsed.achievements) ? parsed.achievements.filter((id) => ACHIEVEMENTS[id]) : [];
    const weapons = Array.isArray(parsed.weapons) ? parsed.weapons.filter((id) => WEAPONS[id]) : [];
    return { version: 1, achievements, ships, weapons };
  } catch {
    return emptyMeta();
  }
}

export function saveMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // storage unavailable
  }
  return meta;
}

export function hasShipUnlock(id) {
  return id === 'hauler' || loadMeta().ships.includes(id);
}

export function grantShipUnlock(id) {
  const meta = loadMeta();
  if (grantShip(meta, id)) saveMeta(meta);
}

export function hasWeaponUnlock(id) {
  const w = WEAPONS[id];
  if (!w) return false;
  if (!w.unlock) return true;
  return loadMeta().weapons.includes(id) || loadMeta().achievements.includes(w.unlock);
}

function grantShip(meta, id) {
  if (!SHIPS[id] || meta.ships.includes(id)) return false;
  meta.ships.push(id);
  return true;
}

function grantWeapon(meta, id) {
  if (!WEAPONS[id] || meta.weapons.includes(id)) return false;
  meta.weapons.push(id);
  return true;
}

export function applyPersistentUnlocks(state) {
  if (!state) return;
  const meta = loadMeta();
  for (const id of meta.weapons) {
    if (!state.weapons.includes(id)) state.weapons.push(id);
  }
}

export function unlockAllForCheat(state) {
  const meta = loadMeta();
  for (const id of SHIP_ORDER) grantShip(meta, id);
  for (const id of Object.keys(ACHIEVEMENTS)) {
    if (!meta.achievements.includes(id)) meta.achievements.push(id);
  }
  for (const id of WEAPON_ORDER) {
    if (WEAPONS[id].unlock) grantWeapon(meta, id);
  }
  saveMeta(meta);
  applyPersistentUnlocks(state);
}

export function checkAchievements(state, result = null) {
  const hull = SHIPS[state.ship] || SHIPS.hauler;
  const maxHull = Math.round(SYSTEMS.hull.value(state.upgrades.hull) * (hull.hullMult || 1));
  const hullFrac = maxHull > 0 && result ? Math.max(0, result.hull ?? 0) / maxHull : 1;
  const ctx = { result, hullFrac };
  const meta = loadMeta();
  const earned = [];

  for (const id of ACHIEVEMENT_ORDER) {
    if (meta.achievements.includes(id)) continue;
    const def = ACHIEVEMENTS[id];
    if (!def.test(state, ctx)) continue;
    meta.achievements.push(id);
    if (def.ship) grantShip(meta, def.ship);
    if (def.weapon) grantWeapon(meta, def.weapon);
    earned.push(id);
  }

  if (earned.length) saveMeta(meta);
  applyPersistentUnlocks(state);
  return earned.map((id) => {
    const def = ACHIEVEMENTS[id];
    const ship = def.ship ? SHIPS[def.ship] : null;
    const weapon = def.weapon ? WEAPONS[def.weapon] : null;
    return {
      id,
      name: def.name,
      reward: ship ? `Hull unlocked: ${ship.name}` : weapon ? `Weapon unlocked: ${weapon.name}` : def.hint,
    };
  });
}

export function shipFeel(id) {
  const d = SHIPS[id] || SHIPS.hauler;
  const bits = [];
  if (d.speedMult && d.speedMult !== 1) bits.push(d.speedMult > 1 ? 'faster' : 'slower');
  if (d.hullMult && d.hullMult !== 1) bits.push(d.hullMult > 1 ? 'tougher hull' : 'lighter hull');
  if (d.shieldMult && d.shieldMult !== 1) bits.push('stronger shield');
  if (d.dmgMult && d.dmgMult !== 1) bits.push('harder hits');
  if (d.fireRate && d.fireRate !== 1) bits.push('faster guns');
  return bits.length ? bits.join(' · ') : 'balanced';
}
