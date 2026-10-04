import { VERSION, CHANGELOG, creditsHtml } from '../changelog.js';
import { loadPrefs, savePrefs } from '../prefs.js';
import { fetchFeatures, submitFeedback } from '../feedback.js';
import { abandonRun, CALLSIGN_RE, ensureCallsign } from '../score.js';
import { clearSave, listSlots, peekSlot, load, save } from '../state.js';
import { wikiHtml } from './wiki.js';
import { startPreviews } from './preview.js';

const PANELS = {
  hub: 'Settings',
  audio: 'Audio',
  display: 'Display',
  gameplay: 'Gameplay',
  escorts: 'Escorts',
  wiki: 'Wiki',
  save: 'Save',
  about: 'About',
  bug: 'Report a bug',
  feature: 'Feature requests',
};

export function renderSettings(root, { audio, party, initialPanel = 'hub', onBack, onSaveCleared, onQrLock }) {
  let panel = PANELS[initialPanel] ? initialPanel : 'hub';
  let wikiSection = 'hostiles';
  let slots = listSlots();
  let stopWikiPreviews = null;

  const draw = () => {
    stopWikiPreviews?.();
    stopWikiPreviews = null;
    root.innerHTML = `
      <div class="menu settings-menu">
        <h1 class="logo">SET<span>TINGS</span></h1>
        <p class="tagline">${escapeHtml(PANELS[panel] === 'Settings' ? 'Audio, display, gameplay, escorts, wiki, save, version history, and feedback.' : PANELS[panel])}</p>
        ${panelBody(panel, { audio, slots, party, wikiSection })}
        <div class="menu-buttons">
          ${panel === 'hub' ? '<button class="btn big" data-act="back">Back</button>' : '<button class="btn big" data-act="hub">Back to Settings</button>'}
        </div>
      </div>`;
    bind(root, {
      audio,
      panel,
      setPanel: (p) => {
        panel = p;
        draw();
      },
      setWiki: (s) => {
        wikiSection = s;
        draw();
      },
      refreshSave: () => {
        slots = listSlots();
        draw();
      },
      onBack: () => {
        stopWikiPreviews?.();
        stopWikiPreviews = null;
        onBack();
      },
      onSaveCleared,
      onQrLock,
      party,
    });
    if (panel === 'wiki') stopWikiPreviews = startPreviews(root);
  };

  draw();
}

function panelBody(panel, { audio, slots, party, wikiSection }) {
  if (panel === 'hub') {
    return `<div class="menu-buttons settings-nav">
      <button class="btn big" data-panel="audio">Audio</button>
      <button class="btn big" data-panel="display">Display</button>
      <button class="btn big" data-panel="gameplay">Gameplay</button>
      <button class="btn big" data-panel="escorts">Escorts</button>
      <button class="btn big" data-panel="wiki">Wiki</button>
      <button class="btn big" data-panel="save">Save</button>
      <button class="btn big" data-panel="about">About</button>
      <button class="btn big" data-panel="bug">Report a bug</button>
      <button class="btn big" data-panel="feature">Feature requests</button>
    </div>`;
  }
  if (panel === 'audio') {
    const vol = Math.round(audio.volume * 100);
    return `<div class="panel settings-panel">
      <div class="settings-row">
        <span>Sound</span>
        <button class="btn small" data-act="mute">Sound: ${audio.muted ? 'Off' : 'On'}</button>
      </div>
      <div class="settings-row volume-row">
        <span>Volume <b data-vol-label>${vol}%</b></span>
        <input type="range" min="0" max="100" value="${vol}" data-volume aria-label="Volume" ${audio.muted ? 'disabled' : ''}>
      </div>
    </div>`;
  }
  if (panel === 'display') {
    const prefs = loadPrefs();
    const full = !!document.fullscreenElement;
    return `<div class="panel settings-panel">
      <div class="settings-row">
        <span>Screen shake</span>
        <button class="btn small" data-act="shake">Shake: ${prefs.shake ? 'On' : 'Off'}</button>
      </div>
      <div class="settings-row">
        <span>Fullscreen</span>
        <button class="btn small" data-act="fullscreen">${full ? 'Exit fullscreen' : 'Enter fullscreen'}</button>
      </div>
    </div>`;
  }
  if (panel === 'gameplay') {
    const prefs = loadPrefs();
    return `<div class="panel settings-panel">
      <div class="settings-row">
        <span>Pace matching</span>
        <button class="btn small" data-act="pace">Pace matching: ${prefs.paceMatching ? 'On' : 'Off'}</button>
      </div>
      <p class="muted small">When on, recent deaths ease combat and fast or clean runs raise it a little. Payouts are never cut. The board records whether this run used it.</p>
    </div>`;
  }
  if (panel === 'escorts') {
    const snap = party?.snapshot?.() || {};
    const qr = snap.qrSrc
      ? `<img class="settings-qr" src="${escapeAttr(snap.qrSrc)}" alt="Join QR">`
      : '';
    const code = snap.room ? `<div class="party-code">${escapeHtml(snap.room)}</div>` : '';
    const crew = snap.crewHtml
      ? `<ul class="party-crew settings-crew">${snap.crewHtml}</ul>`
      : '';
    const locked = loadPrefs().showQr;
    const note = snap.ready
      ? 'Scan to join as an escort, or enter the room code on a phone or laptop.'
      : snap.offline || 'Escorts are offline.';
    return `<div class="panel settings-panel escorts-panel">
      <p class="muted small">${escapeHtml(note)}</p>
      ${qr}
      ${code}
      ${crew}
      <div class="settings-row">
        <span>Corner QR</span>
        <button class="btn small" data-act="qr-lock">Corner QR: ${locked ? 'Locked on' : 'Off'}</button>
      </div>
      <p class="muted small">When locked, the join QR stays in the corner so others can scan it.</p>
    </div>`;
  }
  if (panel === 'wiki') {
    return wikiHtml(wikiSection);
  }
  if (panel === 'save') {
    const filled = (slots || []).filter((s) => !s.empty);
    const fmt = (n) => Math.round(n).toLocaleString();
    const rows = filled.length
      ? filled
          .map(
            (s) => `<div class="settings-row">
        <span>${escapeHtml(s.callsign)} · ${fmt(s.credits)} cr</span>
        <button class="btn small danger" data-act="delete-save" data-slot="${s.index}">Delete</button>
      </div>
      <div class="confirm delete-confirm hidden" data-confirm-slot="${s.index}">
        <p>Delete ${escapeHtml(s.callsign)}? The open Lane Records row will be dropped.</p>
        <button class="btn danger" data-act="delete-confirm" data-slot="${s.index}">Delete</button>
        <button class="btn" data-act="delete-cancel">Cancel</button>
      </div>`,
          )
          .join('')
      : '<p class="muted">No saves on this device. You can keep up to three.</p>';
    return `<div class="panel settings-panel">
      ${rows}
    </div>`;
  }
  if (panel === 'about') {
    return `<div class="panel settings-panel about-panel">
      <p class="eyebrow">Version</p>
      <p class="about-version">v${escapeHtml(VERSION)}</p>
      <div class="changelog">${CHANGELOG.map(
        (entry) => `<section class="changelog-entry">
          <h3>v${escapeHtml(entry.version)}</h3>
          <ul>${entry.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
        </section>`,
      ).join('')}</div>
      <p class="credits about-credits">${creditsHtml()}</p>
    </div>`;
  }
  if (panel === 'bug') {
    const callsign = ensureCallsign();
    return `<div class="panel settings-panel feedback-panel">
      <p class="muted small">Bug reports stay private. Version and browser are attached automatically.</p>
      <form class="feedback-form" data-kind="bug">
        <label>Callsign<input type="text" maxlength="16" spellcheck="false" data-callsign value="${escapeAttr(callsign)}"></label>
        <label>Title<input type="text" maxlength="120" required data-title placeholder="Short summary"></label>
        <label>Details<textarea maxlength="2000" required rows="5" data-body placeholder="What happened, and what did you expect?"></textarea></label>
        <button class="btn primary" type="submit">Send bug report</button>
        <p class="submit-status muted small"></p>
      </form>
    </div>`;
  }
  // feature
  return `<div class="panel settings-panel feedback-panel">
    <p class="muted small">Feature requests are public. Newest ideas show below.</p>
    <form class="feedback-form" data-kind="feature">
      <label>Callsign<input type="text" maxlength="16" spellcheck="false" data-callsign value="${escapeAttr(ensureCallsign())}"></label>
      <label>Title<input type="text" maxlength="120" required data-title placeholder="Idea title"></label>
      <label>Details<textarea maxlength="2000" required rows="4" data-body placeholder="What should it do?"></textarea></label>
      <button class="btn primary" type="submit">Post request</button>
      <p class="submit-status muted small"></p>
    </form>
    <div class="feature-list"><p class="muted center">Loading requests…</p></div>
  </div>`;
}

function bind(root, { audio, panel, setPanel, setWiki, refreshSave, onBack, onSaveCleared, onQrLock }) {
  const menu = root.querySelector('.menu');
  menu.addEventListener('click', async (e) => {
    const wiki = e.target.closest('[data-wiki]');
    if (wiki) {
      setWiki(wiki.dataset.wiki);
      return;
    }
    const nav = e.target.closest('[data-panel]');
    if (nav) {
      setPanel(nav.dataset.panel);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') {
      onBack();
      return;
    }
    if (act === 'hub') {
      setPanel('hub');
      return;
    }
    if (act === 'mute') {
      audio.toggleMute();
      const btn = e.target.closest('[data-act="mute"]');
      if (btn) btn.textContent = `Sound: ${audio.muted ? 'Off' : 'On'}`;
      const slider = root.querySelector('[data-volume]');
      if (slider) slider.disabled = audio.muted;
      return;
    }
    if (act === 'shake') {
      const next = !loadPrefs().shake;
      savePrefs({ shake: next });
      e.target.closest('[data-act="shake"]').textContent = `Shake: ${next ? 'On' : 'Off'}`;
      return;
    }
    if (act === 'pace') {
      const next = !loadPrefs().paceMatching;
      savePrefs({ paceMatching: next });
      const s = load();
      if (s) {
        if (!next) s.paced = false;
        save(s);
      }
      e.target.closest('[data-act="pace"]').textContent = `Pace matching: ${next ? 'On' : 'Off'}`;
      return;
    }
    if (act === 'qr-lock') {
      const next = !loadPrefs().showQr;
      savePrefs({ showQr: next });
      e.target.closest('[data-act="qr-lock"]').textContent = `Corner QR: ${next ? 'Locked on' : 'Off'}`;
      onQrLock?.(next);
      return;
    }
    if (act === 'fullscreen') {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        // browser may deny
      }
      const btn = root.querySelector('[data-act="fullscreen"]');
      if (btn) btn.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
      return;
    }
    if (act === 'delete-save') {
      const slot = e.target.closest('[data-slot]')?.dataset.slot;
      root.querySelectorAll('.delete-confirm').forEach((el) => el.classList.add('hidden'));
      root.querySelector(`.delete-confirm[data-confirm-slot="${slot}"]`)?.classList.remove('hidden');
      return;
    }
    if (act === 'delete-cancel') {
      root.querySelectorAll('.delete-confirm').forEach((el) => el.classList.add('hidden'));
      return;
    }
    if (act === 'delete-confirm') {
      const slot = Number(e.target.closest('[data-slot]')?.dataset.slot);
      await abandonRun(peekSlot(slot));
      clearSave(slot);
      onSaveCleared?.();
      refreshSave();
    }
  });

  const vol = root.querySelector('[data-volume]');
  if (vol) {
    vol.addEventListener('input', () => {
      const v = Number(vol.value) / 100;
      audio.setVolume(v);
      const label = root.querySelector('[data-vol-label]');
      if (label) label.textContent = `${Math.round(v * 100)}%`;
    });
  }

  const form = root.querySelector('.feedback-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = form.querySelector('.submit-status');
      const callsign = (form.querySelector('[data-callsign]')?.value || '').trim();
      const title = (form.querySelector('[data-title]')?.value || '').trim();
      const body = (form.querySelector('[data-body]')?.value || '').trim();
      if (!CALLSIGN_RE.test(callsign)) {
        status.textContent = 'Callsign must be 2–16 letters, numbers, spaces, or hyphens.';
        return;
      }
      if (!title || !body) {
        status.textContent = 'Title and details are required.';
        return;
      }
      status.textContent = 'Sending…';
      try {
        await submitFeedback({
          kind: form.dataset.kind,
          title,
          body,
          callsign,
          version: VERSION,
          user_agent: navigator.userAgent.slice(0, 512),
        });
        status.textContent = form.dataset.kind === 'bug' ? 'Bug report sent. Thank you.' : 'Request posted. Thank you.';
        form.querySelector('[data-title]').value = '';
        form.querySelector('[data-body]').value = '';
        if (form.dataset.kind === 'feature') loadFeatureList(root);
      } catch (err) {
        status.textContent = err.message === 'offline' || err.status === 503
          ? 'Feedback is offline. Host the PHP API on this domain to send reports.'
          : err.message || 'Could not send.';
      }
    });
  }

  if (panel === 'feature') loadFeatureList(root);
}

async function loadFeatureList(root) {
  const list = root.querySelector('.feature-list');
  if (!list) return;
  try {
    const data = await fetchFeatures();
    const rows = data.rows || [];
    if (!rows.length) {
      list.innerHTML = '<p class="muted center">No feature requests yet. Be the first.</p>';
      return;
    }
    list.innerHTML = rows
      .map(
        (r) => `<article class="feature-card">
          <h3>${escapeHtml(r.title)}</h3>
          <p>${escapeHtml(r.body)}</p>
          <p class="muted small">${escapeHtml(r.callsign)} · v${escapeHtml(r.version)} · ${escapeHtml(formatDate(r.created_at))}</p>
        </article>`,
      )
      .join('');
  } catch {
    list.innerHTML = '<p class="muted center">Feedback is offline. Host the PHP API on this domain to see requests.</p>';
  }
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
