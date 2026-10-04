import { VERSION } from './changelog.js';

const PREFS_KEY = 'txl-trader-prefs';
const MUTE_LEGACY = 'txl-trader-muted';
const CALLSIGN_KEY = 'txl-trader-callsign';
const SAVE_KEY = 'txl-trader-save-v1';

const DEFAULTS = {
  muted: false,
  volume: 1,
  shake: true,
  paceMatching: true,
  showQr: false,
  seenVersion: null,
};

function readRaw() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function migrateMuted(base) {
  if (typeof base.muted === 'boolean') return base;
  try {
    if (localStorage.getItem(MUTE_LEGACY) !== null) {
      return { ...base, muted: localStorage.getItem(MUTE_LEGACY) === '1' };
    }
  } catch {
    // ignore
  }
  return base;
}

export function loadPrefs() {
  const stored = readRaw() || {};
  const merged = migrateMuted({ ...DEFAULTS, ...stored });
  const volume = Number(merged.volume);
  return {
    muted: !!merged.muted,
    volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1,
    shake: merged.shake !== false,
    paceMatching: merged.paceMatching !== false,
    showQr: !!merged.showQr,
    seenVersion: typeof merged.seenVersion === 'string' ? merged.seenVersion : null,
  };
}

export function savePrefs(partial) {
  const next = { ...loadPrefs(), ...partial };
  next.volume = Math.max(0, Math.min(1, Number(next.volume) || 0));
  next.muted = !!next.muted;
  next.shake = next.shake !== false;
  next.paceMatching = next.paceMatching !== false;
  next.showQr = !!next.showQr;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    localStorage.setItem(MUTE_LEGACY, next.muted ? '1' : '0');
  } catch {
    // storage unavailable
  }
  return next;
}

export function shakeEnabled() {
  return loadPrefs().shake;
}

export function paceMatchingEnabled() {
  return loadPrefs().paceMatching;
}

function hasReturningMarker() {
  try {
    if (localStorage.getItem(SAVE_KEY)) return true;
    if (localStorage.getItem(CALLSIGN_KEY)) return true;
    if (localStorage.getItem(MUTE_LEGACY) !== null) return true;
    if (localStorage.getItem(PREFS_KEY)) return true;
  } catch {
    // ignore
  }
  return false;
}

export function shouldShowWhatsNew(version = VERSION) {
  // Call before ensureCallsign() so a brand-new browser is not treated as returning.
  if (!hasReturningMarker()) {
    savePrefs({ seenVersion: version });
    return false;
  }
  const { seenVersion } = loadPrefs();
  return seenVersion !== version;
}

export function dismissWhatsNew(version = VERSION) {
  savePrefs({ seenVersion: version });
}
