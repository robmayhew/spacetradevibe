// Tuning tables. Enemy stats scale by HP_GROWTH / DMG_GROWTH per route difficulty;
// the player's matching upgrades scale at the same rates, so a ship whose
// upgrades sit at level N is (barely) balanced for difficulty-N routes.

export const HP_GROWTH = 1.75; // enemy HP per difficulty, and player damage per Weapons Core level
export const DMG_GROWTH = 1.43; // enemy damage per difficulty, and player hull/shield per level
export const PAY_GROWTH = 1.55; // payouts per difficulty
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
  cargo: {
    name: 'Cargo Hold',
    desc: 'More units per contract, which means bigger payouts.',
    start: 1,
    max: 10,
    baseCost: 250,
    value: (l) => 8 + 4 * (l - 1),
    format: (v) => `${v} units`,
  },
};
export const SYSTEM_ORDER = ['core', 'hull', 'shield', 'engine', 'cargo'];

export const WEAPONS = {
  pulse: {
    name: 'Pulse Laser',
    desc: 'Fast, accurate single bolts.',
    cost: 0,
    color: 0x33ffee,
    rate: 6,
    dmg: 10,
    stat: '60 dps · focused',
  },
  scatter: {
    name: 'Scatter Cannon',
    desc: 'Short-range five-pellet spread. Great against swarms.',
    cost: 450,
    color: 0xffcc33,
    rate: 2.6,
    dmg: 6,
    pellets: 5,
    stat: '78 dps · wide, short range',
  },
  seeker: {
    name: 'Seeker Missiles',
    desc: 'Twin homing missiles that hunt the nearest target.',
    cost: 1600,
    color: 0xff44ff,
    rate: 1.7,
    dmg: 24,
    stat: '82 dps · homing',
  },
  beam: {
    name: 'Ion Beam',
    desc: 'Continuous beam that shreds the first target in its path.',
    cost: 4500,
    color: 0x8fa8ff,
    dps: 100,
    stat: '100 dps · instant, focused',
  },
};
export const WEAPON_ORDER = ['pulse', 'scatter', 'seeker', 'beam'];

// hp/contact/bounty are difficulty-1 values; `cost` is the wave-budget cost.
// fire.speed is the difficulty-1 bullet speed (the ship's base speed is 40).
// fire.homing (radians/s) makes single shots steer toward the player until they burn out.
// Every type can appear on every route.
export const ENEMIES = {
  scout: {
    hp: 20, speed: 14, contact: 36, bounty: 3, r: 1.8, color: 0xa04a3c,
    cost: 1, group: [3, 6], formations: ['line', 'column', 'v'],
    fire: { interval: [2.4, 3.8], dmg: 24, speed: 45, homing: 3.5 },
  },
  asteroid: {
    hp: 45, speed: 10, contact: 54, bounty: 2, r: 3, color: 0x6e665c,
    cost: 1, group: [2, 5], formations: ['scatter'],
  },
  fighter: {
    hp: 40, speed: 22, contact: 45, bounty: 5, r: 2.4, color: 0xa8773e,
    cost: 2, group: [1, 3], formations: ['scatter', 'v'],
    fire: { interval: [1.6, 2.4], dmg: 30, speed: 50, homing: 3.5 },
  },
  kamikaze: {
    hp: 14, speed: 48, contact: 75, bounty: 3, r: 1.5, color: 0xb8a046,
    cost: 1.2, group: [3, 6], formations: ['line', 'scatter'],
  },
  gunship: {
    hp: 180, speed: 8, contact: 75, bounty: 15, r: 4.2, color: 0x66607e,
    cost: 6, group: [1, 2], formations: ['line'],
    fire: { interval: [2.3, 3], dmg: 30, speed: 38 },
  },
  sniper: {
    hp: 70, speed: 12, contact: 45, bounty: 8, r: 2.6, color: 0x557a5c,
    cost: 3, group: [1, 3], formations: ['scatter'],
    fire: { interval: [2.8, 3.6], dmg: 39, speed: 85 },
  },
  boss: {
    hp: 1100, speed: 10, contact: 120, bounty: 100, r: 8, color: 0x7c3434,
    fire: { interval: [1, 1], dmg: 33, speed: 60, fanSpeed: 38, spiralSpeed: 34 },
  },
};

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
// can still move a rank. Each lost ship is a large penalty.
export const SCORE = {
  kill: 50,
  boss: 2500,
  death: 10000,
};
