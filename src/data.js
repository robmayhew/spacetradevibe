// Tuning tables. Enemy stats scale by HP_GROWTH / DMG_GROWTH per route difficulty;
// the player's matching upgrades scale at the same rates, so a ship whose
// upgrades sit at level N is (barely) balanced for difficulty-N routes.

export const HP_GROWTH = 1.75; // enemy HP per difficulty, and player damage per Weapons Core level
export const DMG_GROWTH = 1.43; // enemy damage per difficulty, and player hull/shield per level
export const PAY_GROWTH = 1.55; // payouts per difficulty
// Per-difficulty fine-tuning of enemy HP and damage on top of the growth curves
// (1 = unchanged). Rewards are not affected.
export const DIFFICULTY_ADJUST = { 10: 0.9 }; // level 10 was a bit too hard
export const COST_GROWTH = 1.6; // upgrade cost per level

export const SYSTEMS = {
  core: {
    name: 'Weapons Core',
    desc: 'Boosts damage for every weapon you carry.',
    start: 1,
    max: 10,
    baseCost: 210,
    rated: true,
    value: (l) => Math.pow(HP_GROWTH, l - 1),
    format: (v) => `${Math.round(v * 100)}% damage`,
  },
  hull: {
    name: 'Hull Plating',
    desc: 'Maximum hull integrity. Hull damage carries over between flights until repaired.',
    start: 1,
    max: 10,
    baseCost: 180,
    rated: true,
    value: (l) => Math.round(120 * Math.pow(DMG_GROWTH, l - 1)),
    format: (v) => `${v} hull`,
  },
  shield: {
    name: 'Deflector Shield',
    desc: 'Absorbs damage before your hull and recharges when you avoid hits.',
    start: 0,
    max: 10,
    baseCost: 240,
    rated: true,
    value: (l) => (l === 0 ? 0 : Math.round(35 * Math.pow(DMG_GROWTH, l - 1))),
    format: (v) => (v ? `${v} shield` : 'None'),
  },
  engine: {
    name: 'Engines',
    desc: 'Faster maneuvering in combat.',
    start: 1,
    max: 6,
    baseCost: 300,
    value: (l) => 40 + 6 * (l - 1),
    format: (v) => `${v} m/s`,
  },
  scanner: {
    name: 'Lane Scanner',
    desc: 'How many jumps ahead the star map charts. Starts at two systems; upgrade it to see further.',
    start: 1,
    max: 4,
    baseCost: 280,
    value: (l) => 1 + l,
    format: (v) => `${v} jump${v === 1 ? '' : 's'}`,
  },
  cargo: {
    name: 'Cargo Hold',
    desc: 'More units per contract, which means bigger payouts.',
    start: 1,
    max: 10,
    baseCost: 250,
    value: (l) => 8 + 4 * (l - 1),
    format: (v) => `${v} units`,
  },
  hardpoints: {
    name: 'Hardpoints',
    desc: 'Extra mounts that auto-fire assigned guns while you fly the primary.',
    start: 1,
    max: 3,
    baseCost: 900,
    value: (l) => l,
    format: (v) => (v <= 1 ? 'Primary only' : `${v} mounts`),
  },
};
export const SYSTEM_ORDER = ['core', 'hull', 'shield', 'engine', 'scanner', 'cargo', 'hardpoints'];

export const WEAPON_MAX_LEVEL = 5;

export function weaponLevelMult(level) {
  const l = Math.max(1, Number(level) || 1);
  return 1 + 0.07 * (l - 1);
}

export function weaponRateMult(level) {
  const l = Math.max(1, Number(level) || 1);
  return 1 + 0.04 * (l - 1);
}

// Extra hardpoints fire in the background at this share of the gun's own rate.
export const MOUNT_RATE_MULT = 0.55;
export const MOUNT_DMG_MULT = 0.85;

export function canMountWeapon(id) {
  return !!(WEAPONS[id] && WEAPONS[id].kind !== 'beam');
}

export const ESCORT_BAY = {
  hull: {
    name: 'Wing plating',
    desc: 'Hull for every escort that joins this run.',
    start: 1,
    max: 6,
    baseCost: 80,
    value: (l) => Math.round(28 * (1 + 0.2 * (l - 1))),
    format: (v) => `${v} hull`,
  },
  core: {
    name: 'Wing guns',
    desc: 'Bolt damage for the escort wing, as a share of your pulse.',
    start: 1,
    max: 6,
    baseCost: 95,
    value: (l) => +(0.2 * (1 + 0.18 * (l - 1))).toFixed(3),
    format: (v) => `${Math.round(v * 100)}% pulse`,
  },
  engine: {
    name: 'Wing engines',
    desc: 'How closely escorts match your combat speed.',
    start: 1,
    max: 5,
    baseCost: 90,
    value: (l) => +(0.82 + 0.07 * (l - 1)).toFixed(2),
    format: (v) => `${Math.round(v * 100)}% speed`,
  },
  rate: {
    name: 'Wing cyclic',
    desc: 'How fast escorts fire their pulse.',
    start: 1,
    max: 5,
    baseCost: 85,
    value: (l) => +(4 + 0.7 * (l - 1)).toFixed(1),
    format: (v) => `${v}/s`,
  },
};
export const ESCORT_BAY_ORDER = ['hull', 'core', 'engine', 'rate'];

export const SHIPS = {
  hauler: {
    name: 'Hauler',
    desc: 'A reliable cargo hull. Balanced in every way.',
    hint: 'Starter hull.',
    hidden: false,
    color: 0x8a98a8,
    shape: 'player',
    flameY: -2.8,
  },
  courier: {
    name: 'Courier',
    desc: 'A slim mail runner. Faster, a little thinner-skinned.',
    hint: 'Deliver cargo once.',
    hidden: false,
    color: 0x7aa8b8,
    shape: 'courier',
    flameY: -3.0,
    speedMult: 1.12,
    hullMult: 0.92,
  },
  skirmisher: {
    name: 'Skirmisher',
    desc: 'A dart built to shoot first.',
    hint: 'Complete 3 deliveries.',
    hidden: false,
    color: 0xb08a5a,
    shape: 'skirmisher',
    flameY: -2.9,
    fireRate: 1.12,
  },
  bulwark: {
    name: 'Bulwark',
    desc: 'Thick plating, slow feet. Survives a beating.',
    hint: 'Deliver with hull under half.',
    hidden: false,
    color: 0x6a7a6e,
    shape: 'bulwark',
    flameY: -2.6,
    hullMult: 1.12,
    speedMult: 0.9,
  },
  lance: {
    name: 'Lance',
    desc: 'A needle that hits harder than it looks.',
    hint: 'Destroy 25 hostiles.',
    hidden: false,
    color: 0xb0a878,
    shape: 'lance',
    flameY: -3.1,
    dmgMult: 1.12,
  },
  marauder: {
    name: 'Marauder',
    desc: 'A raider hull with extra armor and shield.',
    hint: 'Destroy a capital ship.',
    hidden: false,
    color: 0xa06050,
    shape: 'marauder',
    flameY: -2.7,
    hullMult: 1.08,
    shieldMult: 1.12,
  },
  pathfinder: {
    name: 'Pathfinder',
    desc: 'Long-range scout. Fast and light.',
    hint: 'Visit 15 systems.',
    hidden: false,
    color: 0x6a8a78,
    shape: 'pathfinder',
    flameY: -2.9,
    speedMult: 1.12,
    hullMult: 0.9,
  },
  sovereign: {
    name: 'Sovereign',
    desc: 'Flagship of the lanes. Strong in every column.',
    hint: 'Reach the Terminus.',
    hidden: false,
    color: 0xc4b48a,
    shape: 'sovereign',
    flameY: -3.0,
    hullMult: 1.08,
    speedMult: 1.06,
    dmgMult: 1.06,
    shieldMult: 1.06,
  },
  wraith: {
    name: 'Wraith',
    desc: 'A ghost hull for a flawless crossing.',
    hint: 'Reach the Terminus without losing a ship.',
    hidden: true,
    color: 0x6e7a92,
    shape: 'wraith',
    flameY: -3.2,
    speedMult: 1.12,
    fireRate: 1.12,
    hullMult: 0.92,
    shieldMult: 1.08,
  },
};
export const SHIP_ORDER = ['hauler', 'courier', 'skirmisher', 'bulwark', 'lance', 'marauder', 'pathfinder', 'sovereign', 'wraith'];

export const WEAPONS = {
  pulse: {
    name: 'Pulse Laser',
    desc: 'Fast, accurate single bolts.',
    cost: 0,
    color: 0x33ffee,
    kind: 'bolt',
    rate: 6,
    dmg: 10,
    sfx: 'pulse',
    stat: '60 dps · focused',
  },
  scatter: {
    name: 'Scatter Cannon',
    desc: 'Short-range five-pellet spread. Pellets lose power the farther they fly.',
    cost: 450,
    color: 0xffcc33,
    kind: 'spread',
    rate: 2.6,
    dmg: 2.3, // per pellet: 5 × 2.3 × 2.6/s ≈ 30 dps point-blank
    pellets: 5,
    falloff: 0.75, // share of damage lost by maximum range (linear with distance)
    sfx: 'scatter',
    stat: '30 dps point-blank · weakens with range',
  },
  flak: {
    name: 'Flak Cannon',
    desc: 'A timed shell that bursts into a pellet cloud.',
    cost: 900,
    color: 0xff8844,
    kind: 'burst',
    rate: 2.2,
    dmg: 8,
    split: 6,
    splitDmg: 5,
    sfx: 'scatter',
    stat: 'burst · anti-swarm',
  },
  seeker: {
    name: 'Seeker Missiles',
    desc: 'Twin homing missiles that hunt the nearest target. 3 salvos, then a recharge (5 s; faster with Rapid Recharge).',
    cost: 1600,
    color: 0xff44ff,
    kind: 'homing',
    rate: 1.7,
    dmg: 24,
    count: 2,
    ammo: 3, // salvos before recharging
    reload: 5, // seconds to recharge all salvos (see WEAPON_MODS.seeker)
    sfx: 'seeker',
    stat: '82 dps burst · 3 salvos per recharge',
  },
  rail: {
    name: 'Rail Lance',
    desc: 'A slow, heavy bolt that punches through several hulls.',
    cost: 2800,
    color: 0xa8d4ff,
    kind: 'pierce',
    rate: 1.2,
    dmg: 36,
    pierce: 3,
    sfx: 'pulse',
    stat: 'pierce · heavy',
  },
  beam: {
    name: 'Ion Beam',
    desc: 'Continuous beam that shreds the first target in its path.',
    cost: 4500,
    color: 0x8fa8ff,
    kind: 'beam',
    dps: 100,
    sfx: 'beam',
    stat: '100 dps · instant, focused',
  },
  swarm: {
    name: 'Swarm Darts',
    desc: 'A handful of weak darts that chase whatever is closest.',
    cost: 7000,
    color: 0xff66aa,
    kind: 'homing',
    rate: 1.2,
    dmg: 7,
    count: 4,
    sfx: 'seeker',
    stat: 'homing swarm',
  },
  nova: {
    name: 'Nova Ring',
    desc: 'A ring of shot that bursts from your hull.',
    cost: 0,
    color: 0xffee88,
    kind: 'ring',
    rate: 1.1,
    dmg: 7,
    pellets: 12,
    sfx: 'scatter',
    unlock: 'nova',
    stat: 'omni burst · 75 kills',
  },
};
export const WEAPON_ORDER = ['pulse', 'scatter', 'flak', 'seeker', 'rail', 'beam', 'swarm', 'nova'];

// Special per-weapon mods, bought on the weapon's card once it's installed (separate from
// the generic weapon levels above). Level 1 comes with the weapon. Cost = baseCost × COST_GROWTH for each level already bought.
export const WEAPON_MODS = {
  seeker: {
    name: 'Rapid Recharge',
    desc: 'Each level recharges the 3 salvos faster. The final level removes the delay entirely.',
    start: 1,
    max: 6,
    baseCost: 800,
    costs: { 6: 50000 }, // price for reaching a level, overriding the ×COST_GROWTH curve
    // 5 → 4 → 3.2 → 2.6 → 2.0 s, then level 6: no delay at all
    value: (l) => (l >= 6 ? 0 : Math.round(WEAPONS.seeker.reload * Math.pow(0.8, l - 1) * 10) / 10),
    format: (v) => (v === 0 ? 'No recharge delay' : `${v.toFixed(1)} s recharge`),
  },
};

// hp/contact/bounty are difficulty-1 values; `cost` is the wave-budget cost.
// fire.speed is the difficulty-1 bullet speed (the ship's base speed is 40).
// fire.homing (radians/s) makes single shots steer toward the player until they burn out.
// Every type can appear on every route.
export const ENEMIES = {
  scout: {
    name: 'Scout',
    desc: 'Light interceptors that weave as they close. Their bolts curve toward you.',
    hp: 20, speed: 14, contact: 36, bounty: 3, r: 1.8, color: 0xa04a3c,
    cost: 1, group: [3, 6], formations: ['line', 'column', 'v'],
    fire: { interval: [2.4, 3.8], dmg: 24, speed: 45, homing: 3.5 },
  },
  asteroid: {
    name: 'Asteroid',
    desc: 'Dead rock with no guns. A ram still hurts. Rocks do not count toward a wave’s hostile quota.',
    hp: 45, speed: 10, contact: 54, bounty: 2, r: 3, color: 0x6e665c,
    cost: 1, group: [2, 5], formations: ['scatter'],
  },
  fighter: {
    name: 'Fighter',
    desc: 'Hangs in the lane and shadows your heading. They stay until you kill them, and their shots home.',
    hp: 40, speed: 22, contact: 45, bounty: 5, r: 2.4, color: 0xa8773e,
    cost: 2, group: [1, 3], formations: ['scatter', 'v'],
    fire: { interval: [1.6, 2.4], dmg: 30, speed: 50, homing: 3.5 },
  },
  kamikaze: {
    name: 'Diver',
    desc: 'No guns. After a short run-up they lock onto you and ram. Fragile, but the hit is ugly.',
    hp: 14, speed: 48, contact: 75, bounty: 3, r: 1.5, color: 0xb8a046,
    cost: 1.2, group: [3, 6], formations: ['line', 'scatter'],
  },
  gunship: {
    name: 'Gunship',
    desc: 'A slow, thick hull that parks mid-lane and lobs straight bolts. Treat it as a small tank.',
    hp: 180, speed: 8, contact: 75, bounty: 15, r: 4.2, color: 0x66607e,
    cost: 6, group: [1, 2], formations: ['line'],
    fire: { interval: [2.3, 3], dmg: 30, speed: 38 },
  },
  sniper: {
    name: 'Sniper',
    desc: 'Holds the far end of the lane and fires fast, straight bursts. Keep moving when they light up.',
    hp: 70, speed: 12, contact: 45, bounty: 8, r: 2.6, color: 0x557a5c,
    cost: 3, group: [1, 3], formations: ['scatter'],
    fire: { interval: [2.8, 3.6], dmg: 39, speed: 85 },
  },
  boss: {
    name: 'Capital ship',
    desc: 'A rare extra wave. Huge hull, rotating fans and spirals of shot. Destroying one is worth a lot on the board.',
    hp: 1100, speed: 10, contact: 120, bounty: 100, r: 8, color: 0x7c3434,
    fire: { interval: [1, 1], dmg: 33, speed: 60, fanSpeed: 38, spiralSpeed: 34 },
  },
};
export const ENEMY_ORDER = ['scout', 'fighter', 'kamikaze', 'sniper', 'gunship', 'asteroid', 'boss'];

// `tier` is the lowest route difficulty that offers the good.
export const GOODS = [
  { name: 'Ice Water', base: 11, tier: 1 },
  { name: 'Hydroponic Greens', base: 12, tier: 1 },
  { name: 'Textiles', base: 12, tier: 1 },
  { name: 'Machine Parts', base: 14, tier: 1 },
  { name: 'Medical Supplies', base: 16, tier: 2 },
  { name: 'Ore Concentrate', base: 15, tier: 2 },
  { name: 'Fusion Cells', base: 18, tier: 3 },
  { name: 'Cryo Colonists', base: 17, tier: 3 },
  { name: 'Nanofiber', base: 20, tier: 4 },
  { name: 'Terraforming Seeds', base: 21, tier: 4 },
  { name: 'Quantum Chips', base: 24, tier: 5 },
  { name: 'Luxury Goods', base: 22, tier: 5 },
  { name: 'Antimatter Pods', base: 27, tier: 6 },
  { name: 'Xeno Artifacts', base: 28, tier: 6 },
  { name: 'Dark Matter', base: 30, tier: 7 },
  { name: 'Neural Cores', base: 32, tier: 8 },
  { name: 'Singularity Shards', base: 35, tier: 9 },
  { name: 'Void Relics', base: 38, tier: 10 },
];

// Terminus run score. Credits are the main term; kills and capital ships
// can still move a rank. Each lost ship costs 1,000.
export const SCORE = {
  kill: 50,
  boss: 2500,
  death: 1000,
};
