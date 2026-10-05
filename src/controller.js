import './style.css';
import { CALLSIGN_RE, ensureCallsign, saveCallsign } from './score.js';
import { partyPost } from './party/api.js';
import { escortHex } from './party/colors.js';

let room = String(new URLSearchParams(location.search).get('room') || '').toUpperCase();
const $ = (s) => document.querySelector(s);
const statusEl = $('.status');
const form = $('.join-form');
const controls = $('.controls');
const hullMeter = $('.hull-meter');
const stick = $('#stick');
const knob = stick.querySelector('.knob');
const fireBtn = $('#fire');
const chip = $('.ship-chip');
const keysHint = $('.keys-hint');
const bridge = $('#bridge');
const shipHull = $('.ship-hull');
const shipFlame = $('.ship-flame');
const shipGlow = $('.ship-glow');
const shipName = $('.ship-name');
const waveLine = $('.wave-line');
const routeLine = $('.route-line');

const KEY_AXIS = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const KEY_CODES = new Set([...Object.keys(KEY_AXIS), 'Space']);

const pad = { mx: 0, my: 0, fire: false };
const keys = new Set();
let session;
let pollTimer = 0;
let inputTimer = 0;
let useKeys = false;
let inputBusy = false;
let keysBound = false;

function prefersKeys() {
  return window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 900;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setMeter(root, cur, max) {
  const fill = root.querySelector('.bar span');
  const val = root.querySelector('b');
  const h = Math.max(0, Math.ceil(cur));
  const m = Math.max(0, Math.ceil(max));
  fill.style.width = `${m ? (100 * h) / m : 0}%`;
  fill.classList.toggle('low', m > 0 && h / m < 0.35);
  val.textContent = `${h}/${m}`;
}

function setHull(hull, maxHull) {
  hullMeter.classList.remove('hidden');
  setMeter(hullMeter, hull, maxHull);
}

function paintShip(color) {
  const hex = escortHex(color);
  chip.classList.remove('hidden');
  chip.querySelector('.swatch').style.background = hex;
  chip.querySelector('.swatch').style.boxShadow = `0 0 10px ${hex}`;
  knob.style.background = hex;
  knob.style.borderColor = hex;
  knob.style.boxShadow = `0 0 14px ${hex}`;
  shipHull.style.fill = hex;
  shipFlame.style.fill = '#ff9933';
  shipGlow.style.background = hex;
  shipName.textContent = session?.callsign || 'Escort';
}

function applyPadFromKeys() {
  if (!useKeys) return;
  let mx = 0;
  let my = 0;
  for (const code of keys) {
    const a = KEY_AXIS[code];
    if (!a) continue;
    mx += a[0];
    my += a[1];
  }
  const len = Math.hypot(mx, my) || 1;
  pad.mx = mx ? mx / len : 0;
  pad.my = my ? my / len : 0;
  pad.fire = keys.has('Space');
}

function startKeys() {
  if (keysBound) return;
  keysBound = true;
  window.addEventListener('keydown', (e) => {
    if (!KEY_CODES.has(e.code)) return;
    if (!e.repeat) keys.add(e.code);
    e.preventDefault();
    applyPadFromKeys();
  });
  window.addEventListener('keyup', (e) => {
    if (!KEY_CODES.has(e.code)) return;
    keys.delete(e.code);
    e.preventDefault();
    applyPadFromKeys();
  });
  window.addEventListener('blur', () => {
    keys.clear();
    applyPadFromKeys();
  });
}

function showBridge(combat) {
  document.body.classList.toggle('bridge-mode', useKeys);
  document.body.classList.toggle('waiting', !combat);
  if (!useKeys) {
    bridge.classList.add('hidden');
    keysHint.classList.add('hidden');
    return;
  }
  bridge.classList.remove('hidden');
  keysHint.classList.remove('hidden');
}

function paintBrief(brief, combat) {
  if (!useKeys) return;
  showBridge(combat);
  if (!combat) {
    waveLine.textContent = 'Standing by · docked with the captain';
    routeLine.textContent = 'Flight stats appear when the captain undocks';
    setMeter($('.cap-hull-meter'), 0, 1);
    setMeter($('.cap-shield-meter'), 0, 1);
    $('.wave-v').textContent = '—';
    $('.en-v').textContent = '—';
    $('.by-v').textContent = '—';
    $('.k-v').textContent = '—';
    $('.es-v').textContent = '—';
    $('.wpn-v').textContent = '—';
    return;
  }
  waveLine.textContent = brief?.wt || 'In combat';
  const from = brief?.from || '';
  const to = brief?.to || '';
  routeLine.textContent = from && to ? `${from} → ${to}` : '';
  setMeter($('.cap-hull-meter'), brief?.capH ?? 0, brief?.capM ?? 0);
  setMeter($('.cap-shield-meter'), brief?.sh ?? 0, brief?.sm ?? 0);
  $('.wave-v').textContent = brief?.wt || '—';
  $('.en-v').textContent = brief?.en ?? '—';
  $('.by-v').textContent = brief?.by != null ? String(brief.by) : '—';
  $('.k-v').textContent = brief?.k ?? '—';
  $('.es-v').textContent = brief?.es ?? '—';
  $('.wpn-v').textContent = brief?.wpn ? String(brief.wpn).replace(/-/g, ' ') : '—';
}

function leave() {
  if (!session) return;
  navigator.sendBeacon?.(
    '/api/party.php',
    new Blob([JSON.stringify({ action: 'leave', room: session.room, token: session.token })], { type: 'application/json' }),
  );
}

async function join(callsign) {
  setStatus('Joining…');
  session = await partyPost({ action: 'join', room, callsign });
  paintShip(session.color);
  setStatus('Linked · standing by');
  if (useKeys) {
    startKeys();
    showBridge(false);
    paintBrief(null, false);
  } else {
    controls.classList.remove('hidden');
    startPad();
  }
  await sendInput();
  if (useKeys) inputTimer = window.setInterval(sendInput, 85);
  else {
    pollTimer = window.setInterval(poll, 100);
    inputTimer = window.setInterval(sendInput, 100);
  }
  window.addEventListener('pagehide', leave);
}

function applyLink(data) {
  if (typeof data.color === 'number') paintShip(data.color);
  if (data.mode === 'travel') {
    setHull(data.hull ?? 0, data.maxHull ?? 0);
    if (useKeys) {
      setMeter($('.you-hull-meter'), data.hull ?? 0, data.maxHull ?? 0);
      paintBrief(data.brief, true);
      hullMeter.classList.add('hidden');
      setStatus(data.brief?.wt || 'In combat · WASD move · Space fire');
    } else {
      setStatus('In combat');
    }
  } else {
    setStatus('Linked · standing by');
    hullMeter.classList.add('hidden');
    paintBrief(null, false);
  }
}

async function sendInput() {
  if (!session || inputBusy) return;
  if (useKeys) applyPadFromKeys();
  inputBusy = true;
  try {
    const data = await partyPost({
      action: 'input',
      room: session.room,
      token: session.token,
      mx: pad.mx,
      my: pad.my,
      fire: pad.fire ? 1 : 0,
    });
    applyLink(data);
  } catch (err) {
    if (err.status === 404 || err.status === 403) {
      setStatus(err.message || 'Captain left. Scan the QR again.');
    }
  } finally {
    inputBusy = false;
  }
}

async function poll() {
  if (!session) return;
  try {
    const data = await partyPost({ action: 'poll', room: session.room, token: session.token });
    applyLink(data);
  } catch (err) {
    if (err.status === 404 || err.status === 403) {
      setStatus(err.message || 'Captain left. Scan the QR again.');
    }
  }
}

function startPad() {
  let stickId = null;
  const moveStick = (x, y) => {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (x - cx) / (r.width / 2);
    let dy = (y - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    pad.mx = Math.abs(dx) < 0.12 ? 0 : dx;
    pad.my = Math.abs(dy) < 0.12 ? 0 : -dy;
    knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
  };
  const endStick = () => {
    stickId = null;
    pad.mx = 0;
    pad.my = 0;
    knob.style.transform = '';
  };
  stick.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    moveStick(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', (e) => {
    if (stickId !== e.pointerId) return;
    moveStick(e.clientX, e.clientY);
  });
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);
  const fireOn = () => {
    pad.fire = true;
    fireBtn.classList.add('hot');
  };
  const fireOff = () => {
    pad.fire = false;
    fireBtn.classList.remove('hot');
  };
  fireBtn.addEventListener('pointerdown', fireOn);
  fireBtn.addEventListener('pointerup', fireOff);
  fireBtn.addEventListener('pointercancel', fireOff);
  fireBtn.addEventListener('pointerleave', fireOff);
}

const roomInput = $('#room');
const stickOnly = $('#stick-only');
stickOnly.checked = !prefersKeys();
$('#callsign').value = ensureCallsign();
form.classList.remove('hidden');
if (/^[A-Z0-9]{5}$/.test(room)) {
  roomInput.value = room;
  setStatus('Enter a callsign to join.');
} else {
  $('.room-fields').classList.remove('hidden');
  setStatus('Enter the room code from the captain’s screen.');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = (roomInput.value || room).trim().toUpperCase();
  const callsign = $('#callsign').value.trim();
  if (!/^[A-Z0-9]{5}$/.test(code)) {
    setStatus('Enter the 5-character code from the captain’s screen.');
    return;
  }
  if (!CALLSIGN_RE.test(callsign)) {
    setStatus('Callsign must be 2–16 letters, numbers, spaces, or hyphens.');
    return;
  }
  room = code;
  saveCallsign(callsign);
  useKeys = !stickOnly.checked;
  form.classList.add('hidden');
  try {
    await join(callsign);
  } catch (err) {
    form.classList.remove('hidden');
    setStatus(err.message || 'Could not join. Check the room code and try again.');
  }
});
