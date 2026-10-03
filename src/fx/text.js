import * as THREE from 'three';

const cache = new Map();

// Upright text label rendered to a canvas texture. Materials are cached and shared.
export function textSprite(text, color = '#ffffff', height = 3) {
  const key = `${text}|${color}`;
  let mat = cache.get(key);
  if (!mat) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 44px Orbitron, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 34);
    mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
    cache.set(key, mat);
  }
  const s = new THREE.Sprite(mat);
  s.scale.set(height * 2, height, 1);
  return s;
}
