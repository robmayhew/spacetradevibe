import * as THREE from 'three';
import { solid } from './model.js';
import { SHAPES, GLASS } from './shapes.js';

export const PLAYER_COLOR = 0x8a98a8;

const flameGeo = new THREE.ShapeGeometry(new THREE.Shape(SHAPES.flame.map(([x, y]) => new THREE.Vector2(x, y))));
const shieldGeo = new THREE.RingGeometry(4.3, 4.7, 40);

// The player's ship: hull, engine flame and shield bubble (hidden unless used).
export function createPlayerShip() {
  const group = new THREE.Group();
  group.add(solid('player', SHAPES.player, PLAYER_COLOR, { depth: 1, glass: GLASS.player }));
  const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xff9933, transparent: true, opacity: 0.9 }));
  flame.position.set(0, -2.8, 0.3);
  group.add(flame);
  const shieldRing = new THREE.Mesh(
    shieldGeo,
    new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  shieldRing.position.z = 0.6;
  shieldRing.visible = false;
  group.add(shieldRing);
  return { group, flame, shieldRing };
}
