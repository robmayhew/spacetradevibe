import QRCode from 'qrcode/lib/browser.js';
import { partyPost } from './api.js';
import { escortHex } from './colors.js';

export class PartyHost {
  constructor(root) {
    this.root = root;
    this.ready = false;
    this.room = null;
    this.peer = null;
    this.token = null;
    this.mode = 'wait';
    this.escorts = new Map();
    this.pollTimer = 0;
    this.sendAcc = 0;
    this.mount();
  }

  mount() {
    this.root.innerHTML = `
      <div class="party-panel hidden">
        <div class="eyebrow">Escorts</div>
        <img class="party-qr" alt="Join QR" title="Hide QR" />
        <button type="button" class="party-show hidden">QR code</button>
        <div class="party-code"></div>
        <p class="muted small party-hint">Scan to fly a helper ship</p>
        <ul class="party-crew"></ul>
      </div>`;
    this.el = {
      panel: this.root.querySelector('.party-panel'),
      qr: this.root.querySelector('.party-qr'),
      show: this.root.querySelector('.party-show'),
      code: this.root.querySelector('.party-code'),
      crew: this.root.querySelector('.party-crew'),
    };
    this.el.qr.addEventListener('click', () => this.setQrVisible(false));
    this.el.show.addEventListener('click', () => this.setQrVisible(true));
  }

  setQrVisible(on) {
    this.el.panel.classList.toggle('qr-hidden', !on);
    this.el.qr.classList.toggle('hidden', !on);
    this.el.show.classList.toggle('hidden', on);
    document.body.classList.toggle('party-qr-hidden', !on);
  }

  async start() {
    try {
      const data = await partyPost({ action: 'create' });
      this.room = data.room;
      this.peer = data.peer;
      this.token = data.token;
      this.ready = true;
      const url = `${location.origin}/controller.html?room=${this.room}`;
      this.el.qr.src = await QRCode.toDataURL(url, {
        margin: 1,
        width: 220,
        color: { dark: '#1a1c1f', light: '#ddd6c8' },
      });
      this.el.code.textContent = this.room;
      this.el.panel.classList.remove('hidden');
      document.body.classList.add('has-party');
      this.setQrVisible(false);
      this.renderCrew();
      this.pollTimer = window.setInterval(() => this.poll(), 100);
      window.addEventListener('pagehide', this.leave);
    } catch (err) {
      console.warn('Party escorts offline:', err);
      this.el.panel.classList.remove('hidden');
      this.el.qr.classList.add('hidden');
      this.el.show.classList.add('hidden');
      this.el.code.textContent = '';
      this.el.crew.innerHTML = `<li class="muted">${err.message || 'Escorts are offline.'}</li>`;
    }
  }

  leave = () => {
    if (!this.ready) return;
    navigator.sendBeacon?.(
      '/api/party.php',
      new Blob([JSON.stringify({ action: 'leave', room: this.room, token: this.token })], { type: 'application/json' }),
    );
  };

  inputs() {
    return [...this.escorts.values()]
      .filter((e) => e.connected)
      .map((e) => ({ id: e.id, callsign: e.callsign, color: e.color, mx: e.mx, my: e.my, fire: e.fire }));
  }

  setMode(mode) {
    this.mode = mode;
  }

  setVitals(id, hull, maxHull) {
    const e = this.escorts.get(id);
    if (!e) return;
    e.hull = hull;
    e.maxHull = maxHull;
  }

  tick(dt) {
    if (!this.ready) return;
    this.sendAcc += dt;
    if (this.sendAcc < 0.2) return;
    this.sendAcc = 0;
    const hulls = [...this.escorts.values()].map((e) => ({
      peer: e.id,
      hull: e.hull ?? 1,
      maxHull: e.maxHull ?? 1,
    }));
    partyPost({ action: 'vitals', room: this.room, token: this.token, mode: this.mode, hulls }).catch(() => {});
  }

  renderCrew() {
    const rows = [...this.escorts.values()].filter((e) => e.connected);
    this.el.crew.innerHTML = rows.map((e) => {
      const hex = escortHex(e.color);
      return `<li><span class="swatch" style="background:${hex};box-shadow:0 0 8px ${hex}"></span>${e.callsign}</li>`;
    }).join('') || '<li class="muted">Waiting for phones</li>';
  }

  async poll() {
    try {
      const data = await partyPost({ action: 'poll', room: this.room, token: this.token });
      const seen = new Set();
      for (const e of data.escorts || []) {
        seen.add(e.id);
        const row = this.escorts.get(e.id) || { id: e.id, hull: 1, maxHull: 1 };
        row.callsign = e.callsign;
        row.color = e.color ?? 0;
        row.mx = e.mx ?? 0;
        row.my = e.my ?? 0;
        row.fire = !!e.fire;
        row.connected = true;
        this.escorts.set(e.id, row);
      }
      for (const id of [...this.escorts.keys()]) {
        if (!seen.has(id)) this.escorts.delete(id);
      }
      this.renderCrew();
    } catch {
      /* keep the last QR if the poll blips */
    }
  }
}
