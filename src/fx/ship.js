import * as THREE from 'three';
import { solid } from './model.js';
import { SHAPES, GLASS } from './shapes.js';
import { SHIPS } from '../data.js';
import { ESCORT_COLOR_HEX } from '../party/colors.js';

export const PLAYER_COLOR = 0x8a98a8;
export const ESCORT_COLORS = ESCORT_COLOR_HEX.map((h) => parseInt(h.slice(1), 16));

const flameGeo = new THREE.ShapeGeometry(new THREE.Shape(SHAPES.flame.map(([x, y]) => new THREE.Vector2(x, y))));
const shieldGeo = new THREE.RingGeometry(4.3, 4.7, 40);

function hullParts(shipId) {
  const def = SHIPS[shipId] || SHIPS.hauler;
  const shape = def.shape || 'player';
  return {
    def,
    shape,
    pts: SHAPES[shape] || SHAPES.player,
    glass: GLASS[shape] || GLASS.player,
  };
}

// The player's ship: hull, engine flame and shield bubble (hidden unless used).
export function createPlayerShip(color, { shield = true, scale = 1, ship = 'hauler' } = {}) {
  const { def, shape, pts, glass } = hullParts(ship);
  const col = color ?? def.color ?? PLAYER_COLOR;
  const group = new THREE.Group();
  group.add(solid(shape, pts, col, { depth: 1, glass }));
  const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xff9933, transparent: true, opacity: 0.9 }));
  flame.position.set(0, def.flameY ?? -2.8, 0.3);
  group.add(flame);
  let shieldRing = null;
  if (shield) {
    shieldRing = new THREE.Mesh(
      shieldGeo,
      new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    shieldRing.position.z = 0.6;
    shieldRing.visible = false;
    group.add(shieldRing);
  }
  if (scale !== 1) group.scale.setScalar(scale);
  return { group, flame, shieldRing, ship };
}

export function createEscortShip(color) {
  return createPlayerShip(color, { shield: false, scale: 0.62 });
}
