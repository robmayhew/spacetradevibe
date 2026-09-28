import * as THREE from 'three';
import { Starfield } from '../fx/starfield.js';
import { glowSprite, neon } from '../fx/neon.js';
import { SHAPES } from '../fx/shapes.js';

// Ambient starfield behind the main menu and station screens.
export class BackdropView {
  constructor(pixelRatio) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02030a);
    this.camera = new THREE.OrthographicCamera(-50, 50, 50, -50, -10, 10);
    this.stars = new Starfield(this.scene, pixelRatio);
    this.t = 0;

    const nebulae = [
      [0x5522aa, -60, 20, 140, 0.18],
      [0x0a6680, 70, -25, 160, 0.16],
      [0xaa2255, 20, 45, 90, 0.08],
    ];
    for (const [c, x, y, s, o] of nebulae) {
      const sp = glowSprite(c, s, o);
      sp.position.set(x, y, -8);
      this.scene.add(sp);
    }

    // A ship that drifts across the menu for flavor.
    this.ship = neon('player', SHAPES.player, 0x33ffee, 0.35);
    this.ship.scale.setScalar(1.6);
    this.scene.add(this.ship);
    this.showShip = true;
  }

  update(dt) {
    this.t += dt;
    this.stars.update(dt, 5);
    this.ship.visible = this.showShip;
    this.ship.position.set(Math.sin(this.t * 0.3) * 6 + this.halfW * 0.55, -18 + Math.sin(this.t * 0.7) * 3, 0);
  }

  resize(w, h) {
    const aspect = w / h;
    this.halfW = 50 * aspect;
    Object.assign(this.camera, { left: -this.halfW, right: this.halfW, top: 50, bottom: -50 });
    this.camera.updateProjectionMatrix();
  }
}
