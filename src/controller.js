import './style.css';
import { CALLSIGN_RE } from './score.js';
import { partyPost } from './party/api.js';
import { escortHex } from './party/colors.js';

const room = String(new URLSearchParams(location.search).get('room') || '').toUpperCase();
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

const pad = { mx: 0, my: 0, fire: false };
let session;
let pollTimer = 0;
let inputTimer = 0;

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
  controls.classList.remove('hidden');
  startPad();
  await sendInput();
  pollTimer = window.setInterval(poll, 100);
  inputTimer = window.setInterval(sendInput, 100);
  window.addEventListener('pagehide', leave);
}

async function sendInput() {
  if (!session) return;
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
      setStatus('In combat');
      setHull(data.hull ?? 0, data.maxHull ?? 0);
    } else {
      setStatus('Linked · standing by');
      hullMeter.classList.add('hidden');
    }
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

if (!/^[A-Z0-9]{5}$/.test(room)) {
  setStatus('Scan the QR on the captain’s screen.');
} else {
  try {
    const saved = localStorage.getItem('txl-escort-callsign') || 'ESCORT';
    $('#callsign').value = saved;
  } catch {
    /* ignore */
  }
  setStatus('Enter a callsign to join.');
  form.classList.remove('hidden');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const callsign = $('#callsign').value.trim() || 'ESCORT';
    if (!CALLSIGN_RE.test(callsign)) {
      setStatus('Callsign must be 2–16 letters, numbers, spaces, or hyphens.');
      return;
    }
    try {
      localStorage.setItem('txl-escort-callsign', callsign);
    } catch {
      /* ignore */
    }
    form.classList.add('hidden');
    try {
      await join(callsign);
    } catch (err) {
      form.classList.remove('hidden');
      setStatus(err.message || 'Could not join. Check the room code and try again.');
    }
  });
}
