import { SHIPS, WEAPONS } from '../data.js';
import { SHAPES, GLASS } from '../fx/shapes.js';

function hex(n) {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}

function poly(ctx, pts, scale, ox, oy, flipY = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const px = ox + x * scale;
    const py = oy + (flipY ? -y : y) * scale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

function size(c) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const host = c.parentElement || c;
  const w = Math.max(1, Math.round(host.clientWidth || c.clientWidth || 1));
  const h = Math.max(1, Math.round(host.clientHeight || c.clientHeight || 1));
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  if (c.width !== bw) c.width = bw;
  if (c.height !== bh) c.height = bh;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function fit(ctx, w, h, sceneW, sceneH, pad = 16) {
  const s = Math.min((w - pad * 2) / sceneW, (h - pad * 2) / sceneH);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(s, s);
  return s;
}

function drawShip(c, t, shipId) {
  const { ctx, w, h } = size(c);
  ctx.clearRect(0, 0, w, h);
  if (w < 8 || h < 8) return;
  const hull = SHIPS[shipId] || SHIPS.hauler;
  const pts = SHAPES[hull.shape || 'player'] || SHAPES.player;
  const glass = GLASS[hull.shape || 'player'];
  fit(ctx, w, h, 12, 14, 18);
  ctx.translate(0, Math.sin(t * 2.2) * 0.25);
  poly(ctx, pts, 1, 0, 0);
  ctx.fillStyle = hex(hull.color || 0x8a98a8);
  ctx.fill();
  if (glass) {
    poly(ctx, glass, 1, 0, 0);
    ctx.fillStyle = 'rgba(200, 232, 255, 0.45)';
    ctx.fill();
  }
  ctx.fillStyle = '#ff9933';
  ctx.beginPath();
  ctx.moveTo(-0.55, 3.3);
  ctx.lineTo(0, 4.6 + (Math.sin(t * 18) * 0.5 + 0.5) * 0.9);
  ctx.lineTo(0.55, 3.3);
  ctx.fill();
  ctx.restore();
}

function drawGun(c, t, id) {
  const { ctx, w, h } = size(c);
  ctx.clearRect(0, 0, w, h);
  if (w < 8 || h < 8) return;
  const gun = WEAPONS[id] || WEAPONS.pulse;
  const col = hex(gun.color);
  const kind = gun.kind;
  fit(ctx, w, h, 100, 100, 14);
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.4;
  const cx = 0;
  const cy = 42;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx, cy - 14);
  ctx.lineTo(cx + 8, cy);
  ctx.fill();
  const cycle = (t * (gun.rate || 3)) % 1;
  if (kind === 'beam') {
    ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * 12);
    ctx.fillRect(cx - 2.4, -44, 4.8, cy - 8);
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }
  if (kind === 'spread') {
    const n = gun.pellets || 5;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.22;
      const d = 14 + cycle * 52;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy - 16 + Math.sin(a) * d, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  if (kind === 'ring') {
    ctx.globalAlpha = 1 - cycle;
    ctx.beginPath();
    ctx.arc(cx, cy - 18, 8 + cycle * 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }
  if (kind === 'homing') {
    const n = gun.count || 2;
    for (let i = 0; i < n; i++) {
      const s = n === 1 ? 0 : (i - (n - 1) / 2);
      const d = cycle * 68;
      const wob = Math.sin(t * 8 + i) * 8;
      ctx.beginPath();
      ctx.arc(cx + s * 12 + wob, cy - 16 - d, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  if (kind === 'burst') {
    const d = cycle < 0.45 ? (cycle / 0.45) * 32 : 32;
    ctx.beginPath();
    ctx.arc(cx, cy - 16 - d, 3.4, 0, Math.PI * 2);
    ctx.fill();
    if (cycle > 0.45) {
      const u = (cycle - 0.45) / 0.55;
      const n = gun.split || 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * u * 24, cy - 48 + Math.sin(a) * u * 18, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    return;
  }
  const d = cycle * 70;
  const pw = kind === 'pierce' ? 3.2 : 2.4;
  const ph = kind === 'pierce' ? 16 : 10;
  ctx.fillRect(cx - pw / 2, cy - 16 - d - ph, pw, ph);
  ctx.restore();
}

function drawEscort(c, t) {
  const { ctx, w, h } = size(c);
  ctx.clearRect(0, 0, w, h);
  if (w < 8 || h < 8) return;
  fit(ctx, w, h, 12, 14, 18);
  ctx.translate(0, Math.sin(t * 3) * 0.2);
  ctx.fillStyle = '#66d4a8';
  poly(ctx, SHAPES.player, 1, 0, 0);
  ctx.fill();
  ctx.restore();
}

export function startPreviews(root) {
  const canvases = [...root.querySelectorAll('canvas[data-preview]')];
  if (!canvases.length) return () => {};
  let stop = false;
  const t0 = performance.now();
  const tick = (now) => {
    if (stop) return;
    const t = (now - t0) / 1000;
    for (const c of canvases) {
      if (c.parentElement?.hidden) continue;
      const [kind, id] = (c.dataset.preview || '').split(':');
      if (kind === 'ship') drawShip(c, t, id);
      else if (kind === 'gun') drawGun(c, t, id);
      else if (kind === 'escort') drawEscort(c, t);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => {
    stop = true;
  };
}
