import { CALLSIGN_RE, randomCallsign } from '../score.js';
import { VERSION, CHANGELOG, creditsHtml } from '../changelog.js';
import { dismissWhatsNew } from '../prefs.js';
import { MAX_SLOTS } from '../state.js';

export function renderMenu(root, {
  slots = [],
  showWhatsNew = false,
  view = 'home',
  onContinue,
  onPickSave,
  onDeleteSave,
  onNew,
  onStart,
  onReplace,
  onBack,
  onLeaderboard,
  onSettings,
}) {
  const filled = slots.filter((s) => !s.empty);
  const latest = CHANGELOG[0];
  root.innerHTML = `
    <div class="menu">
      <h1 class="logo">TXL<span>TRADER</span></h1>
      <p class="tagline">Haul cargo. Survive the lanes. Reach the Terminus.</p>
      ${
        showWhatsNew
          ? `<div class="panel whats-new">
        <p class="eyebrow">What's new in v${escapeHtml(VERSION)}</p>
        <ul>${(latest?.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
        <button class="btn small" data-act="dismiss-new">Got it</button>
      </div>`
          : ''
      }
      <div class="menu-buttons">
        ${viewButtons(view, { filled })}
        <button class="btn big" data-act="join">Join with code</button>
        <form class="join-code hidden">
          <label>
            Room code
            <input type="text" maxlength="5" spellcheck="false" autocomplete="off" data-room placeholder="ABC12">
          </label>
          <button class="btn primary" type="submit">Join</button>
        </form>
        <p class="join-hint muted small hidden"></p>
        <button class="btn big" data-act="board">Leaderboard</button>
        <button class="btn big" data-act="settings">Settings</button>
      </div>
      <p class="menu-version muted small"><button type="button" class="version-link" data-act="about">v${escapeHtml(VERSION)}</button></p>
      <p class="credits menu-credits">${creditsHtml()}</p>
      <div class="howto panel">
        <h3>How to play</h3>
        <ul>
          <li>Pick a contract at the station, then <b>Launch</b> to haul it to the destination.</li>
          <li>Survive 1–4 waves of hostiles (sometimes a capital ship) to dock and get paid.</li>
          <li>Spend credits on upgrades. Routes run from difficulty 1 to 10; flying above your <b>Ship Rating</b> is allowed but deadly.</li>
          <li>Fly deeper into the galaxy and reach the <b>Terminus</b> to win.</li>
        </ul>
        <div class="keys">
          <span><kbd>WASD</kbd>/<kbd>Arrows</kbd> move</span>
          <span><kbd>Space</kbd> fire</span>
          <span><kbd>F</kbd> auto-fire</span>
          <span><kbd>1</kbd>-<kbd>8</kbd> / <kbd>Q</kbd><kbd>E</kbd> weapons</span>
          <span><kbd>Esc</kbd> pause</span>
        </div>
        <div class="touch-howto">
          <span>Stick to move</span>
          <span>Fire</span>
          <span>Auto</span>
          <span>Weapons</span>
          <span>Pause</span>
        </div>
      </div>
    </div>`;
  const joinForm = root.querySelector('.join-code');
  const joinHint = root.querySelector('.join-hint');
  const nameInput = root.querySelector('[data-callsign]');
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = (joinForm.querySelector('[data-room]')?.value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) {
      joinHint.textContent = 'Enter the 5-character code from the captain’s screen.';
      joinHint.classList.remove('hidden');
      return;
    }
    location.href = `/controller.html?room=${encodeURIComponent(code)}`;
  });
  root.querySelector('.menu').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'continue') onContinue?.();
    if (act === 'pick') onPickSave?.(Number(e.target.closest('[data-act="pick"]').dataset.slot));
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
      onDeleteSave?.(Number(e.target.closest('[data-slot]')?.dataset.slot));
      return;
    }
    if (act === 'new') onNew?.();
    if (act === 'replace') onReplace?.(Number(e.target.closest('[data-act="replace"]').dataset.slot));
    if (act === 'start') {
      const name = nameInput?.value.trim() || '';
      const hint = root.querySelector('[data-new-hint]');
      if (!CALLSIGN_RE.test(name)) {
        if (hint) {
          hint.textContent = 'Callsign must be 2–16 letters, numbers, spaces, or hyphens.';
          hint.classList.remove('hidden');
        }
        return;
      }
      onStart?.(name);
    }
    if (act === 'home') onBack?.();
    if (act === 'join') {
      joinForm.classList.remove('hidden');
      joinForm.querySelector('[data-room]')?.focus();
    }
    if (act === 'roll') {
      if (nameInput) nameInput.value = randomCallsign();
      return;
    }
    if (act === 'board') onLeaderboard();
    if (act === 'settings') onSettings?.();
    if (act === 'about') onSettings?.('about');
    if (act === 'dismiss-new') {
      dismissWhatsNew(VERSION);
      e.target.closest('.whats-new')?.remove();
    }
  });
}

function viewButtons(view, { filled }) {
  const fmt = (n) => Math.round(n).toLocaleString();
  if (view === 'continue') {
    return `
      <p class="callsign-hint muted small">Choose a save.</p>
      ${filled
        .map(
          (s) => `<div class="save-pick">
        <button class="btn ${s.active ? 'primary' : ''} big" data-act="pick" data-slot="${s.index}">${escapeHtml(s.callsign)} · ${fmt(s.credits)} cr</button>
        <button class="btn danger save-del" data-act="delete-save" data-slot="${s.index}">Delete</button>
      </div>
      <div class="confirm delete-confirm hidden" data-confirm-slot="${s.index}">
        <p>Delete ${escapeHtml(s.callsign)}? The open Lane Records row will be dropped.</p>
        <button class="btn danger" data-act="delete-confirm" data-slot="${s.index}">Delete</button>
        <button class="btn" data-act="delete-cancel">Cancel</button>
      </div>`,
        )
        .join('')}
      <button class="btn" data-act="home">Back</button>`;
  }
  if (view === 'replace') {
    return `
      <p class="callsign-hint muted small">All ${MAX_SLOTS} saves are full. Replace one.</p>
      ${filled
        .map(
          (s) => `<button class="btn danger big" data-act="replace" data-slot="${s.index}">Replace ${escapeHtml(s.callsign)}</button>`,
        )
        .join('')}
      <button class="btn" data-act="home">Back</button>`;
  }
  if (view === 'new') {
    return `
      <div class="callsign-row">
        <label class="callsign-field">
          Callsign
          <input type="text" maxlength="16" spellcheck="false" autocomplete="nickname" data-callsign value="${escapeAttr(randomCallsign())}">
        </label>
        <button type="button" class="btn callsign-roll" data-act="roll" title="Random callsign" aria-label="Random callsign">⚄</button>
      </div>
      <p class="callsign-hint muted small">This names the save and Lane Records. A duplicate gets a number.</p>
      <button class="btn primary big" data-act="start">Start</button>
      <p class="callsign-hint warn small hidden" data-new-hint></p>
      <button class="btn" data-act="home">Back</button>`;
  }
  return `
        ${filled.length ? '<button class="btn primary big" data-act="continue">Continue</button>' : ''}
        <button class="btn ${filled.length ? '' : 'primary'} big" data-act="new">New Game</button>`;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
