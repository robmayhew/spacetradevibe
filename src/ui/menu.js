import { CALLSIGN_RE } from '../score.js';
import { VERSION, CHANGELOG, creditsHtml } from '../changelog.js';
import { dismissWhatsNew } from '../prefs.js';

export function renderMenu(root, {
  hasSave,
  callsign,
  showWhatsNew = false,
  onNew,
  onContinue,
  onLeaderboard,
  onCallsign,
  onSettings,
}) {
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
        <label class="callsign-field">
          Callsign
          <input type="text" maxlength="16" spellcheck="false" autocomplete="nickname" data-callsign value="${escapeAttr(callsign || '')}">
        </label>
        <p class="callsign-hint muted small">Lane Records uses this name while you fly and when you arrive.</p>
        ${hasSave ? '<button class="btn primary big" data-act="continue">Continue</button>' : ''}
        <button class="btn ${hasSave ? '' : 'primary'} big" data-act="new">New Game</button>
        <div class="confirm hidden">
          <p>Start over? Your current save will be overwritten.</p>
          <button class="btn danger" data-act="new-confirm">Overwrite</button>
          <button class="btn" data-act="new-cancel">Cancel</button>
        </div>
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
      </div>
    </div>`;
  const confirm = root.querySelector('.confirm');
  const joinForm = root.querySelector('.join-code');
  const joinHint = root.querySelector('.join-hint');
  const nameInput = root.querySelector('[data-callsign]');
  const persistName = () => {
    const name = nameInput.value.trim();
    if (!CALLSIGN_RE.test(name)) return;
    onCallsign?.(name);
  };
  nameInput.addEventListener('change', persistName);
  nameInput.addEventListener('blur', persistName);
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = (joinForm.querySelector('[data-room]')?.value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) {
      joinHint.textContent = 'Enter the 5-character code from the captain’s screen.';
      joinHint.classList.remove('hidden');
      return;
    }
    persistName();
    location.href = `/controller.html?room=${encodeURIComponent(code)}`;
  });
  root.querySelector('.menu').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'continue') onContinue();
    if (act === 'new') hasSave ? confirm.classList.remove('hidden') : onNew();
    if (act === 'new-confirm') onNew();
    if (act === 'new-cancel') confirm.classList.add('hidden');
    if (act === 'join') {
      joinForm.classList.remove('hidden');
      joinForm.querySelector('[data-room]')?.focus();
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
