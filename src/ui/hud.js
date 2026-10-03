import { WEAPONS, WEAPON_ORDER } from '../data.js';
import { tierCss } from '../views/starmap.js';

// DOM overlay for the travel screen.
export class TravelHUD {
  constructor(root, { from, to, difficulty, owned, onResume, onRetreat }) {
    this.root = root;
    root.innerHTML = `
      <div class="hud">
        <div class="hud-tl">
          <div class="meter"><label>HULL</label><div class="bar hull"><span></span></div><b class="hull-v"></b></div>
          <div class="meter"><label>SHIELD</label><div class="bar shield"><span></span></div><b class="shield-v"></b></div>
        </div>
        <div class="hud-tc">
          <div class="wave-label"></div>
          <div class="bossbar hidden"><span></span></div>
        </div>
        <div class="hud-tr">
          <div class="route">${from} <span>→</span> ${to}</div>
          <div class="diff">Difficulty <b style="color:${tierCss(difficulty)}">${difficulty}</b></div>
          <div class="bounty">Bounty <b class="bounty-v">0</b> cr</div>
        </div>
        <div class="hud-bc weapons">
          ${WEAPON_ORDER.map(
            (id, i) => `<div class="wslot ${owned.includes(id) ? '' : 'locked'}" data-w="${id}">
              <kbd>${i + 1}</kbd>${WEAPONS[id].name}</div>`,
          ).join('')}
        </div>
        <div class="hud-bl with-party">WASD / Arrows move · Space fire · F auto-fire <b class="auto-v">OFF</b> · 1-4 / Q E weapons · Esc pause</div>
        <div class="banner"></div>
        <div class="pause-overlay hidden">
          <div class="panel">
            <h2>Paused</h2>
            <button class="btn primary" data-act="resume">Resume</button>
            <button class="btn danger" data-act="retreat">Retreat to origin</button>
            <p class="muted">Retreating forfeits the contract and bounties, but costs no tow fee.</p>
          </div>
        </div>
      </div>`;
    const $ = (s) => root.querySelector(s);
    this.el = {
      hull: $('.bar.hull span'), hullV: $('.hull-v'),
      shield: $('.bar.shield span'), shieldV: $('.shield-v'), shieldMeter: $('.bar.shield').parentElement,
      wave: $('.wave-label'), boss: $('.bossbar'), bossFill: $('.bossbar span'),
      bounty: $('.bounty-v'), banner: $('.banner'), pause: $('.pause-overlay'), auto: $('.auto-v'),
      slots: [...root.querySelectorAll('.wslot')],
    };
    this.el.pause.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'resume') onResume();
      if (act === 'retreat') onRetreat();
    });
    this.cache = {};
  }

  set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  update({ hull, maxHull, shield, maxShield, bounty, weapon, waveText, boss, auto }) {
    this.set('hull', Math.ceil(hull), (v) => {
      this.el.hull.style.width = `${(100 * v) / maxHull}%`;
      this.el.hullV.textContent = `${Math.max(0, v)}/${maxHull}`;
      this.el.hull.classList.toggle('low', v / maxHull < 0.3);
    });
    this.set('shield', Math.ceil(shield), (v) => {
      this.el.shieldMeter.classList.toggle('hidden', !maxShield);
      this.el.shield.style.width = maxShield ? `${(100 * v) / maxShield}%` : '0';
      this.el.shieldV.textContent = `${v}/${maxShield}`;
    });
    this.set('bounty', bounty, (v) => (this.el.bounty.textContent = v));
    this.set('weapon', weapon, (v) => this.el.slots.forEach((s) => s.classList.toggle('active', s.dataset.w === v)));
    this.set('wave', waveText, (v) => (this.el.wave.textContent = v));
    this.set('auto', auto, (v) => (this.el.auto.textContent = v ? 'ON' : 'OFF'));
    this.set('boss', boss == null ? -1 : Math.ceil(boss * 200), (v) => {
      this.el.boss.classList.toggle('hidden', v < 0);
      if (v >= 0) this.el.bossFill.style.width = `${v / 2}%`;
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
