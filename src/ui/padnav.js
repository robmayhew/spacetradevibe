// Gamepad navigation for menus, the station screen, pop-ups and the pause menu.
// D-pad / left stick moves a highlight between buttons, A clicks, B goes back,
// LB / RB switch station tabs. Inactive while flying or docking (unless paused).

const FOCUSABLE = 'button:not(:disabled), .contract';
const FIRST_REPEAT = 0.35;
const REPEAT = 0.12;

export class PadNav {
  constructor(app) {
    this.app = app;
    this.current = null;
    this.key = null; // identifies the focused control across re-renders
    this.dir = null;
    this.repeatT = 0;
    this.active = false; // highlight shows only after the pad is used
    window.addEventListener('mousemove', () => this.setActive(false));
    window.addEventListener('gamepadconnected', (e) => toast(`Gamepad connected: ${shortName(e.gamepad.id)}`));
    window.addEventListener('gamepaddisconnected', () => toast('Gamepad disconnected'));
  }

  update(dt) {
    const pad = this.app.input.pad;
    if (!pad.connected) return;
    const view = this.app.view;
    const flying = view?.setPaused && !view.paused;
    if (flying || document.querySelector('.dev-console:not(.hidden)')) {
      this.highlight(null);
      return;
    }
    // The first touch only reveals the highlight on the default control.
    if (!this.active) {
      if (pad.pressed.size || this.direction(pad)) {
        this.setActive(true);
        this.dir = this.direction(pad);
        this.repeatT = FIRST_REPEAT;
        this.highlight(this.ensure());
      }
      return;
    }

    const dir = this.direction(pad);
    if (dir && dir !== this.dir) {
      this.repeatT = FIRST_REPEAT;
      this.move(dir);
    } else if (dir) {
      this.repeatT -= dt;
      if (this.repeatT <= 0) {
        this.repeatT = REPEAT;
        this.move(dir);
      }
    }
    this.dir = dir;

    if (pad.pressed.has('A')) this.ensure()?.click();
    if (pad.pressed.has('B')) this.back();
    if (pad.pressed.has('LB') || pad.pressed.has('RB')) this.switchTab(pad.pressed.has('RB') ? 1 : -1);
    this.highlight(this.ensure());
  }

  direction(pad) {
    const { x, y } = pad.stick;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return null;
    return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'up' : 'down';
  }

  // The topmost layer gets focus: a pop-up, the pause menu, then the page.
  scope() {
    const modals = document.querySelectorAll('.modal-wrap');
    if (modals.length) return modals[modals.length - 1];
    const pause = document.querySelector('.pause-overlay:not(.hidden)');
    if (pause) return pause;
    return document.getElementById('ui');
  }

  items() {
    return [...this.scope().querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length && !el.closest('.hidden'));
  }

  keyOf(el) {
    return `${el.dataset.act ?? ''}|${el.dataset.id ?? ''}|${el.dataset.sort ?? ''}|${el.textContent.trim().slice(0, 24)}`;
  }

  // Keep focus on the same control after the screen re-renders; otherwise pick a sensible default.
  ensure() {
    const items = this.items();
    if (this.current && items.includes(this.current)) return this.current;
    const same = this.key && items.find((el) => this.keyOf(el) === this.key);
    this.focus(same || items.find((el) => el.matches('.btn.primary')) || items.find((el) => el.matches('.contract')) || items[0] || null);
    return this.current;
  }

  focus(el) {
    this.current = el;
    this.key = el ? this.keyOf(el) : null;
    if (el && this.active) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  move(dir) {
    const from = this.ensure();
    if (!from) return;
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of this.items()) {
      if (el === from) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - ax;
      const dy = b.top + b.height / 2 - ay;
      const along = { right: dx, left: -dx, down: dy, up: -dy }[dir];
      if (along <= 4) continue; // must be in that direction
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) this.focus(best);
  }

  back() {
    const scope = this.scope();
    const btn =
      scope.querySelector('[data-act="close-modal"]') ||
      scope.querySelector('[data-act="resume"]') ||
      scope.querySelector('[data-act="new-cancel"]:not(.hidden *)') ||
      scope.querySelector('[data-act="back"]');
    btn?.click();
  }

  switchTab(step) {
    const tabs = [...document.querySelectorAll('.tabs .tab')];
    if (!tabs.length || document.querySelector('.modal-wrap')) return;
    const i = tabs.findIndex((t) => t.classList.contains('active'));
    tabs[(i + step + tabs.length) % tabs.length].click();
  }

  setActive(on) {
    if (this.active === on) return;
    this.active = on;
    if (!on) this.highlight(null);
  }

  highlight(el) {
    if (this.shown === el) return;
    this.shown?.classList.remove('pad-focus');
    el?.classList.add('pad-focus');
    this.shown = el;
  }
}

function shortName(id) {
  return id.replace(/\s*\(.*$/, '').trim() || 'gamepad';
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'pad-toast';
  el.textContent = `🎮 ${text}`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 2600);
}
