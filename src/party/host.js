import QRCode from 'qrcode/lib/browser.js';
import { iceConfig, partyPost } from './api.js';

export class PartyHost {
  constructor(root) {
    this.root = root;
    this.ready = false;
    this.room = null;
    this.peer = null;
    this.token = null;
    this.iceServers = null;
    this.since = 0;
    this.mode = 'wait';
    this.escorts = new Map();
    this.pendingIce = new Map();
    this.pollTimer = 0;
    this.sendAcc = 0;
    this.disconnectAt = new Map();
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
      this.iceServers = data.iceServers;
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
      this.pollTimer = window.setInterval(() => this.poll(), 400);
      window.addEventListener('pagehide', this.leave);
    } catch (err) {
      console.warn('Party escorts offline:', err);
      this.el.panel.classList.remove('hidden');
      this.el.qr.classList.add('hidden');
      this.el.show.classList.add('hidden');
      this.el.code.textContent = '';
      this.el.crew.innerHTML = `<li class="muted">${err.message || 'Escorts need npm run dev'}</li>`;
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
      .map((e) => ({ id: e.id, callsign: e.callsign, mx: e.mx, my: e.my, fire: e.fire }));
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
    const t = performance.now();
    for (const [id, at] of this.disconnectAt) {
      if (t - at > 8000) this.dropEscort(id);
    }
    this.sendAcc += dt;
    if (this.sendAcc < 0.2) return;
    this.sendAcc = 0;
    const payload = JSON.stringify({ t: 'st', mode: this.mode });
    for (const e of this.escorts.values()) {
      if (e.channel?.readyState !== 'open') continue;
      const msg = JSON.stringify({ t: 'st', mode: this.mode, hull: e.hull ?? 1, maxHull: e.maxHull ?? 1 });
      try {
        e.channel.send(this.mode === 'travel' ? msg : payload);
      } catch {
        /* channel can close between the check and send */
      }
    }
  }

  renderCrew() {
    const rows = [...this.escorts.values()].filter((e) => e.connected);
    this.el.crew.innerHTML = rows.map((e) => `<li>${e.callsign}</li>`).join('')
      || '<li class="muted">Waiting for phones</li>';
  }

  async poll() {
    try {
      const data = await partyPost({ action: 'poll', room: this.room, token: this.token, since: this.since });
      this.since = data.since ?? this.since;
      this.names = Object.fromEntries((data.escorts || []).map((e) => [e.id, e.callsign]));
      for (const sig of data.signals || []) {
        if (sig.kind === 'offer') await this.acceptOffer(sig.from, sig.payload);
        else if (sig.kind === 'ice') await this.addIce(sig.from, sig.payload);
      }
    } catch {
      /* keep the last QR if the poll blips */
    }
  }

  async acceptOffer(from, offer) {
    this.closePeer(from);
    const pc = new RTCPeerConnection(iceConfig(this.iceServers));
    const row = {
      id: from,
      callsign: this.names?.[from] || 'ESCORT',
      mx: 0,
      my: 0,
      fire: false,
      connected: false,
      pc,
      channel: null,
      hull: 1,
      maxHull: 1,
    };
    this.escorts.set(from, row);
    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      partyPost({ action: 'signal', room: this.room, token: this.token, to: from, kind: 'ice', payload: ev.candidate });
    };
    pc.ondatachannel = (ev) => this.bindChannel(from, ev.channel);
    pc.onconnectionstatechange = () => this.onState(from, pc);
    await pc.setRemoteDescription(offer);
    const queued = this.pendingIce.get(from) || [];
    this.pendingIce.delete(from);
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* stale candidate */
      }
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await partyPost({
      action: 'signal',
      room: this.room,
      token: this.token,
      to: from,
      kind: 'answer',
      payload: pc.localDescription,
    });
  }

  async addIce(from, candidate) {
    const row = this.escorts.get(from);
    if (!row?.pc?.remoteDescription) {
      const q = this.pendingIce.get(from) || [];
      q.push(candidate);
      this.pendingIce.set(from, q);
      return;
    }
    try {
      await row.pc.addIceCandidate(candidate);
    } catch {
      /* ignore */
    }
  }

  bindChannel(from, channel) {
    const row = this.escorts.get(from);
    if (!row) return;
    row.channel = channel;
    channel.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t !== 'in') return;
      row.mx = Math.max(-1, Math.min(1, Number(msg.mx) || 0));
      row.my = Math.max(-1, Math.min(1, Number(msg.my) || 0));
      row.fire = !!msg.fire;
    };
    channel.onopen = () => {
      const row = this.escorts.get(from);
      if (!row || row.channel !== channel) return;
      row.connected = true;
      this.disconnectAt.delete(from);
      this.renderCrew();
    };
    channel.onclose = () => {
      const row = this.escorts.get(from);
      if (row?.channel === channel) this.dropEscort(from);
    };
  }

  onState(from, pc) {
    const row = this.escorts.get(from);
    if (!row || row.pc !== pc) return;
    if (pc.connectionState === 'connected') {
      this.disconnectAt.delete(from);
      row.connected = true;
      this.renderCrew();
    } else if (pc.connectionState === 'disconnected') {
      this.disconnectAt.set(from, performance.now());
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      this.dropEscort(from);
    }
  }

  closePeer(from) {
    const row = this.escorts.get(from);
    if (!row) return;
    try {
      row.channel?.close();
    } catch {
      /* already closed */
    }
    try {
      row.pc?.close();
    } catch {
      /* already closed */
    }
  }

  dropEscort(from) {
    this.closePeer(from);
    this.escorts.delete(from);
    this.disconnectAt.delete(from);
    this.pendingIce.delete(from);
    this.renderCrew();
    if (this.ready) {
      partyPost({ action: 'drop', room: this.room, token: this.token, peer: from }).catch(() => {});
    }
  }
}
