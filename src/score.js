import { SCORE } from './data.js';

const CALLSIGN_KEY = 'txl-trader-callsign';
const API = '/api';

export const CALLSIGN_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,14}[A-Za-z0-9]$/;
export const MIN_TIME_MS = 3 * 60 * 1000;

export function runScore(stats) {
  const earned = stats?.earned ?? 0;
  const kills = stats?.kills ?? 0;
  const bosses = stats?.bosses ?? 0;
  const deaths = stats?.deaths ?? 0;
  return {
    earned,
    killPts: kills * SCORE.kill,
    bossPts: bosses * SCORE.boss,
    deathPts: deaths * SCORE.death,
    total: earned + kills * SCORE.kill + bosses * SCORE.boss - deaths * SCORE.death,
  };
}

export function formatRunTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function hasRunClock(state) {
  return Number.isFinite(state?.runMs) && !!state?.runId;
}

const SYL_A = ['Ka', 'Ve', 'Or', 'Zan', 'Tel', 'Myr', 'Ax', 'Cor', 'Dra', 'Eos', 'Fal', 'Gor', 'Hel', 'Ix', 'Jor', 'Kel', 'Lum', 'Nov', 'Pyr', 'Rho', 'Sol', 'Tyr', 'Vex', 'Xan', 'Yra', 'Ar', 'Bel', 'Nym', 'Os'];
const SYL_B = ['ra', 'on', 'is', 'ex', 'ia', 'us', 'or', 'an', 'eth', 'ul', 'ys', 'ar', 'iel', 'os', 'ion', 'ax'];

export function randomCallsign() {
  const a = SYL_A[Math.floor(Math.random() * SYL_A.length)];
  const b = SYL_B[Math.floor(Math.random() * SYL_B.length)];
  let name = a + b;
  if (Math.random() < 0.45) name += `-${1 + Math.floor(Math.random() * 9)}`;
  return name.slice(0, 16);
}

export function loadCallsign() {
  try {
    return localStorage.getItem(CALLSIGN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveCallsign(name) {
  try {
    localStorage.setItem(CALLSIGN_KEY, name);
  } catch {
    // storage unavailable
  }
}

export function ensureCallsign() {
  const existing = loadCallsign().trim();
  if (CALLSIGN_RE.test(existing)) return existing;
  const name = randomCallsign();
  saveCallsign(name);
  return name;
}

export async function fetchBoard(sort = 'score') {
  const res = await fetch(`${API}/board.php?sort=${sort === 'time' ? 'time' : 'score'}`);
  if (!res.ok) throw new Error('offline');
  return res.json();
}

export async function submitRun(payload) {
  const res = await fetch(`${API}/score.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'offline');
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}
