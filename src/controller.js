import './style.css';
import { CALLSIGN_RE } from './score.js';
import { iceConfig, partyPost } from './party/api.js';

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

const pad = { mx: 0, my: 0, fire: false };
let pc;
let channel;
let session;
let since = 0;
let pollTimer = 0;
const pendingIce = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function setHull(hull, maxHull) {
  hullMeter.classList.remove('hidden');
  const h = Math.max(0, Math.ceil(hull));
  hullFill.style.width = `${maxHull ? (100 * h) / maxHull : 0}%`;
  hullV.textContent = `${h}/${maxHull}`;
}

async function join(callsign) {
  setStatus('Joining…');
  session = await partyPost({ action: 'join', room, callsign });
  pc = new RTCPeerConnection(iceConfig(session.iceServers));
  channel = pc.createDataChannel('pad');
  channel.onopen = () => {
    setStatus('Linked · standing by');
    controls.classList.remove('hidden');
    startPad();
  };
  channel.onclose = () => setStatus('Link closed');
  channel.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.t !== 'st') return;
    if (msg.mode === 'travel') {
      setStatus('In combat');
      setHull(msg.hull ?? 0, msg.maxHull ?? 0);
    } else {
      setStatus('Standing by');
      hullMeter.classList.add('hidden');
    }
  };
  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    partyPost({
      action: 'signal',
      room: session.room,
      token: session.token,
      to: session.host,
      kind: 'ice',
      payload: ev.candidate,
    }).catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') setStatus('Could not link. Stay on the same Wi-Fi and scan again.');
    if (pc.connectionState === 'connected') setStatus('Linked · standing by');
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await partyPost({
    action: 'signal',
    room: session.room,
    token: session.token,
    to: session.host,
    kind: 'offer',
    payload: pc.localDescription,
  });
  pollTimer = window.setInterval(poll, 400);
  window.addEventListener('pagehide', () => {
    navigator.sendBeacon?.(
      '/api/party.php',
      new Blob([JSON.stringify({ action: 'leave', room: session.room, token: session.token })], { type: 'application/json' }),
    );
  });
}

async function poll() {
  if (!session) return;
  try {
    const data = await partyPost({ action: 'poll', room: session.room, token: session.token, since });
    since = data.since ?? since;
    for (const sig of data.signals || []) {
      if (sig.kind === 'answer') {
        await pc.setRemoteDescription(sig.payload);
        for (const c of pendingIce) {
          try {
            await pc.addIceCandidate(c);
          } catch {
            /* stale */
          }
        }
        pendingIce.length = 0;
      } else if (sig.kind === 'ice') {
        if (!pc.remoteDescription) pendingIce.push(sig.payload);
        else {
          try {
            await pc.addIceCandidate(sig.payload);
          } catch {
            /* stale */
          }
        }
      }
    }
  } catch {
    /* brief API blip */
  }
}

function startPad() {
  let stickId = null;
  const send = () => {
    if (channel?.readyState === 'open') {
      try {
        channel.send(JSON.stringify({ t: 'in', mx: pad.mx, my: pad.my, fire: pad.fire ? 1 : 0 }));
      } catch {
        /* ignore */
      }
    }
  };
  window.setInterval(send, 50);

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
      setStatus(err.message || 'Could not join.');
    }
  });
}
