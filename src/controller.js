import './style.css';
import { CALLSIGN_RE, ensureCallsign, saveCallsign } from './score.js';
import { partyPost } from './party/api.js';
import { escortHex } from './party/colors.js';
import { EscortArena } from './party/screen.js';

let room = String(new URLSearchParams(location.search).get('room') || '').toUpperCase();
const $ = (s) => document.querySelector(s);
const statusEl = $('.status');
const form = $('.join-form');
const controls = $('.controls');
const hullMeter = $('.hull-meter');
const hullFill = $('.bar.hull span');
const hullV = $('.hull-v');
const stick = $('#stick');
const knob = stick.querySelector('.knob');
const fireBtn = $('#fire');
const chip = $('.ship-chip');
const keysHint = $('.keys-hint');
const arenaEl = $('#arena');

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
let frameTimer = 0;
let arena = null;
let useScreen = false;

function prefersScreen() {
  return window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 900;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setHull(hull, maxHull) {
  hullMeter.classList.remove('hidden');
  const h = Math.max(0, Math.ceil(hull));
  hullFill.style.width = `${maxHull ? (100 * h) / maxHull : 0}%`;
  hullV.textContent = `${h}/${maxHull}`;
}

function paintShip(color) {
  const hex = escortHex(color);
  chip.classList.remove('hidden');
  chip.querySelector('.swatch').style.background = hex;
  chip.querySelector('.swatch').style.boxShadow = `0 0 10px ${hex}`;
  knob.style.background = hex;
  knob.style.borderColor = hex;
  knob.style.boxShadow = `0 0 14px ${hex}`;
}

function applyPadFromKeys() {
  if (!useScreen) return;
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
  arena?.setInput(pad.mx, pad.my);
}

function startKeys() {
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

function showArena(on) {
  document.body.classList.toggle('screen-mode', useScreen);
  document.body.classList.toggle('waiting', !on);
  arenaEl.classList.toggle('hidden', !on);
  keysHint.classList.toggle('hidden', !useScreen);
  if (on && useScreen && !arena) arena = new EscortArena(arenaEl);
  else if (on) arena?.resize();
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
  if (useScreen) {
    startKeys();
    showArena(false);
  } else {
    controls.classList.remove('hidden');
    startPad();
  }
  await sendInput();
  pollTimer = window.setInterval(poll, 100);
  inputTimer = window.setInterval(sendInput, useScreen ? 50 : 100);
  if (useScreen) frameTimer = window.setInterval(pollFrame, 100);
  window.addEventListener('pagehide', leave);
}

async function sendInput() {
  if (!session) return;
  if (useScreen) applyPadFromKeys();
  try {
    await partyPost({
      action: 'input',
      room: session.room,
      token: session.token,
      mx: pad.mx,
      my: pad.my,
      fire: pad.fire ? 1 : 0,
    });
  } catch (err) {
    if (err.status === 404 || err.status === 403) {
      setStatus(err.message || 'Captain left. Scan the QR again.');
    }
  }
}

async function poll() {
  if (!session) return;
  try {
    const data = await partyPost({ action: 'poll', room: session.room, token: session.token });
    if (typeof data.color === 'number') paintShip(data.color);
    if (data.mode === 'travel') {
      setStatus(useScreen ? 'In combat · WASD move · Space fire' : 'In combat');
      setHull(data.hull ?? 0, data.maxHull ?? 0);
    } else {
      setStatus('Linked · standing by');
      hullMeter.classList.add('hidden');
      if (useScreen) showArena(false);
    }
  } catch (err) {
    if (err.status === 404 || err.status === 403) {
      setStatus(err.message || 'Captain left. Scan the QR again.');
    }
  }
}

async function pollFrame() {
  if (!session || !useScreen) return;
  try {
    const data = await partyPost({ action: 'frame', room: session.room, token: session.token });
    if (data.frame) {
      showArena(true);
      arena?.applyFrame(data.frame, session.peer || data.peer);
      if (data.frame.wt) setStatus(data.frame.wt);
    } else {
      showArena(false);
    }
  } catch {
    /* keep the last frame if the poll blips */
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
    knob.style.transform = 'translate(0,0)';
  };

  stick.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    moveStick(e.clientX, e.clientY);
    e.preventDefault();
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    moveStick(e.clientX, e.clientY);
    e.preventDefault();
  });
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);

  const fireOn = (e) => {
    pad.fire = true;
    fireBtn.classList.add('hot');
    e.preventDefault();
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
stickOnly.checked = !prefersScreen();
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
  useScreen = !stickOnly.checked;
  form.classList.add('hidden');
  try {
    await join(callsign);
  } catch (err) {
    form.classList.remove('hidden');
    setStatus(err.message || 'Could not join. Check the room code and try again.');
  }
});
