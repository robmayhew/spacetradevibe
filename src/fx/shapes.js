import { RNG } from '../rng.js';
import { regularPolygon, starPolygon } from './neon.js';

// Enemy shapes point down (toward the player). Units are world units (view is 100 tall).
export const SHAPES = {
  player: [[0, 4], [1, 1.6], [1.4, -0.4], [3.2, -2.4], [3.2, -3.2], [1, -2.2], [0.6, -3], [-0.6, -3], [-1, -2.2], [-3.2, -3.2], [-3.2, -2.4], [-1.4, -0.4], [-1, 1.6]],
  scout: [[0, -2.2], [2, 1.6], [0, 0.8], [-2, 1.6]],
  fighter: [[0, -3], [1, -0.6], [3, 1.4], [1, 0.9], [0, 2], [-1, 0.9], [-3, 1.4], [-1, -0.6]],
  kamikaze: [[0, -1.8], [1.2, 0], [0, 1.8], [-1.2, 0]],
  gunship: [[-2, -4], [2, -4], [4.4, -1], [4.4, 2], [2, 3.6], [-2, 3.6], [-4.4, 2], [-4.4, -1]],
  sniper: [[0, -4], [0.9, -0.5], [2.6, 2], [0, 1.1], [-2.6, 2], [-0.9, -0.5]],
  boss: [
    [0, -6], [2.5, -4], [4, -7], [6, -3], [9.5, -4.5], [9, 0], [11, 3], [6, 3.5], [4, 6], [0, 4.5],
    [-4, 6], [-6, 3.5], [-11, 3], [-9, 0], [-9.5, -4.5], [-6, -3], [-4, -7], [-2.5, -4],
  ],
  missile: [[0, 1.2], [0.5, -0.8], [-0.5, -0.8]],
  flame: [[0, -1.8], [0.7, 0], [-0.7, 0]],
  station: regularPolygon(6, 14, Math.PI / 6),
  stationInner: regularPolygon(6, 8, 0),
  terminus: starPolygon(5, 7, 3),
};

export const ASTEROID_VARIANTS = 5;
const asteroidCache = [];
export function asteroidShape(v) {
  if (!asteroidCache[v]) {
    const rng = new RNG(1000 + v);
    const n = 9;
    asteroidCache[v] = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const r = 3 * rng.float(0.7, 1.1);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  }
  return asteroidCache[v];
}
