// DOM overlay for the docking / undocking mini-game.
export class DockHUD {
  constructor(root, { mode, station, pad, onResume }) {
    this.root = root;
    const objective = mode === 'dock' ? `Land on <b>Pad ${pad}</b>` : `Clear <b>Pad ${pad}</b> and fly through the <b>departure gate</b>`;
    root.innerHTML = `
      <div class="hud dock-hud">
        <div class="hud-tl">
          <div class="meter"><label>HULL</label><div class="bar hull"><span></span></div><b class="hull-v"></b></div>
        </div>
        <div class="hud-tc">
          <div class="wave-label">${mode === 'dock' ? 'DOCKING' : 'UNDOCKING'} · ${station}</div>
          <div class="objective">${objective}</div>
        </div>
        <div class="hud-tr">
          <div>Time <b class="time-v">0.0</b>s</div>
          <div>Bumps <b class="bumps-v">0</b></div>
          ${mode === 'dock' ? '<div class="muted">No bumps = precision bonus</div>' : ''}
        </div>
        <div class="dock-hint"></div>
        <div class="hud-bl">WASD / Arrows thrust · Esc pause · Bumping traffic or the station damages your hull</div>
        <div class="banner"></div>
        <div class="pause-overlay hidden">
          <div class="panel">
            <h2>Paused</h2>
            <button class="btn primary" data-act="resume">Resume</button>
          </div>
        </div>
      </div>`;
    const $ = (s) => root.querySelector(s);
    this.el = {
      hull: $('.bar.hull span'), hullV: $('.hull-v'), time: $('.time-v'), bumps: $('.bumps-v'),
      hint: $('.dock-hint'), banner: $('.banner'), pause: $('.pause-overlay'),
    };
    this.el.pause.addEventListener('click', (e) => {
      if (e.target.closest('[data-act=resume]')) onResume();
    });
    this.cache = {};
  }

  set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  update({ hull, maxHull, time, bumps, hint }) {
    this.set('hull', Math.ceil(hull), (v) => {
      this.el.hull.style.width = `${(100 * v) / maxHull}%`;
      this.el.hullV.textContent = `${v}/${maxHull}`;
      this.el.hull.classList.toggle('low', v / maxHull < 0.3);
    });
    this.set('time', time.toFixed(1), (v) => (this.el.time.textContent = v));
    this.set('bumps', bumps, (v) => (this.el.bumps.textContent = v));
    this.set('hint', hint, (v) => {
      this.el.hint.textContent = v;
      this.el.hint.classList.toggle('show', !!v);
    });
  }

  banner(text, sub = '', cls = '') {
    this.el.banner.className = `banner show ${cls}`;
    this.el.banner.innerHTML = `<div>${text}</div>${sub ? `<small>${sub}</small>` : ''}`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), 1800);
  }

  setPaused(p) {
    this.el.pause.classList.toggle('hidden', !p);
  }

  destroy() {
    clearTimeout(this.bannerTimer);
    this.root.innerHTML = '';
  }
}
