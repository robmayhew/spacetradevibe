import * as THREE from 'three';
import { neon } from './neon.js';
import { SHAPES } from './shapes.js';

const flameGeo = new THREE.ShapeGeometry(new THREE.Shape(SHAPES.flame.map(([x, y]) => new THREE.Vector2(x, y))));
const shieldGeo = new THREE.RingGeometry(4.3, 4.7, 40);

// The player's ship: hull outline, engine flame and shield bubble (hidden unless used).
export function createPlayerShip() {
  const group = new THREE.Group();
  group.add(neon('player', SHAPES.player, 0x33ffee, 0.35));
  const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xff9933, transparent: true, opacity: 0.9 }));
  flame.position.y = -2.8;
  group.add(flame);
  const shieldRing = new THREE.Mesh(
    shieldGeo,
    new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  shieldRing.visible = false;
  group.add(shieldRing);
  return { group, flame, shieldRing };
}
