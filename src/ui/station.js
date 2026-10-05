import { SYSTEMS, SYSTEM_ORDER, WEAPONS, WEAPON_ORDER, WEAPON_MODS, SHIPS, SHIP_ORDER, ESCORT_BAY, ESCORT_BAY_ORDER, WEAPON_MAX_LEVEL, canMountWeapon } from '../data.js';
import {
  shipStats, shipRating, routeDanger, upgradeCost, repairCost, repair, buyUpgrade, buyWeapon, hasWeapon, save, selectShip,
  extraMountSlots, extraMounts, weaponLevel, weaponLevelCost, buyWeaponLevel, setMount, weaponTuneStat,
  escortLevel, escortUpgradeCost, buyEscortUpgrade, pacePressure, formatPace, formatHeat,
  weaponModLevel, weaponModCost, buyWeaponMod,
} from '../state.js';
import { paceMatchingEnabled } from '../prefs.js';
import { hasShipUnlock, hasWeaponUnlock, shipFeel } from '../achievements.js';
import { routeDifficulty, scanRange } from '../galaxy.js';
import { tierCss } from '../views/starmap.js';
import { startPreviews } from './preview.js';

const fmt = (n) => Math.round(n).toLocaleString();

function pips(level, max, color = '') {
  return `<span class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < level ? 'on' : ''}" style="${i < level && color ? `background:${color}` : ''}"></i>`).join('')}</span>`;
}

function dangerTag(difficulty, rating) {
  const d = routeDanger(difficulty, rating);
  return `<span class="danger-tag lvl${d.level}" style="--c:${d.color}">${d.level >= 3 ? '⚠ ' : ''}${d.label} danger</span>`;
}

function diffBadge(d) {
  return `<span class="diff-badge" style="--c:${tierCss(d)}">${d}</span>`;
}

export class StationScreen {
  constructor(game, { report } = {}) {
    this.game = game;
    this.app = game.app;
    this.tab = 'contracts';
    this.selected = null;
    this.root = document.createElement('div');
    this.root.className = 'station';
    this.app.ui.innerHTML = '';
    this.app.ui.appendChild(this.root);
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('pointerover', (e) => this.onInspect(e));
    this.inspect = 'sys:core';
    this.render();
    if (report) this.showReport(report);
  }

  get state() {
    return this.game.state;
  }
  get galaxy() {
    return this.game.galaxy;
  }

  onClick(e) {
    const inspect = e.target.closest('[data-inspect]');
    if (inspect && this.tab === 'ship') this.setInspect(inspect.dataset.inspect);
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const { act, id } = el.dataset;
    const audio = this.app.audio;
    const s = this.state;
    switch (act) {
      case 'tab':
        this.tab = id;
        audio.play('click');
        break;
      case 'select':
        this.selectContract(+id);
        return;
      case 'launch': {
        const c = s.contracts.find((c) => c.dest === this.selected);
        if (c) this.game.launch(c);
        return;
      }
      case 'upgrade':
        audio.play(buyUpgrade(s, id) ? 'buy' : 'deny');
        break;
      case 'buy':
        audio.play(buyWeapon(s, id) ? 'buy' : 'deny');
        break;
      case 'wmod':
        audio.play(buyWeaponMod(s, id) ? 'buy' : 'deny');
        break;
      case 'gun-up':
        audio.play(buyWeaponLevel(s, id) ? 'buy' : 'deny');
        break;
      case 'mount': {
        const slot = Number(el.dataset.slot);
        const cur = (Array.isArray(s.mounts) ? s.mounts : [])[slot];
        audio.play(setMount(s, slot, cur === id ? null : id) ? 'buy' : 'deny');
        break;
      }
      case 'escort':
        audio.play(buyEscortUpgrade(s, id) ? 'buy' : 'deny');
        break;
      case 'equip':
        audio.play(selectShip(s, id) ? 'buy' : 'deny');
        break;
      case 'repair':
        audio.play(repair(s) ? 'buy' : 'deny');
        break;
      case 'menu':
        this.game.showMenu();
        return;
      case 'close-modal':
        el.closest('.modal-wrap').remove();
        return;
      case 'fit':
        this.game.starmap.zoomToFit();
        return;
      case 'here':
        this.game.starmap.focus(s.current);
        return;
      default:
        return;
    }
    save(s);
    this.render();
  }

  onInspect(e) {
    const card = e.target.closest('[data-inspect]');
    if (!card || this.tab !== 'ship') return;
    this.setInspect(card.dataset.inspect);
  }

  setInspect(key) {
    if (!key || this.inspect === key) return;
    this.inspect = key;
    const canvas = this.root.querySelector('.stage-preview');
    const frame = this.root.querySelector('.stage-frame');
    if (canvas) canvas.dataset.preview = key;
    if (frame) frame.hidden = String(key).startsWith('sys:');
    const copy = this.root.querySelector('.stage-copy');
    if (copy) copy.innerHTML = this.inspectCopy(key);
    this.root.querySelectorAll('[data-inspect]').forEach((el) => {
      el.classList.toggle('inspecting', el.dataset.inspect === key);
    });
  }

  inspectCopy(key) {
    const [kind, id] = String(key || '').split(':');
    const s = this.state;
    if (kind === 'sys' && SYSTEMS[id]) {
      const def = SYSTEMS[id];
      const lvl = s.upgrades[id];
      const cost = upgradeCost(id, lvl);
      const cur = def.format(def.value(lvl));
      const next = cost != null ? def.format(def.value(lvl + 1)) : null;
      return `<p class="eyebrow">System</p><h3>${def.name}</h3><p class="muted">${def.desc}</p>
        <div class="u-stat">${cur}${next ? ` <span class="arrow">→</span> <b>${next}</b>` : ' <span class="muted">(max)</span>'}</div>`;
    }
    if (kind === 'gun' && WEAPONS[id]) {
      const w = WEAPONS[id];
      const owned = hasWeapon(s, id);
      const lvl = owned ? weaponLevel(s, id) : 1;
      const cur = weaponTuneStat(id, lvl);
      const next = owned && lvl < WEAPON_MAX_LEVEL ? weaponTuneStat(id, lvl + 1) : null;
      return `<p class="eyebrow">Armament</p><h3>${w.name}</h3><p class="muted">${w.desc}</p>
        <div class="u-stat">${owned ? `${cur}${next ? ` <span class="arrow">→</span> <b>${next}</b>` : ' <span class="muted">(max)</span>'}` : w.stat}</div>
        ${w.kind === 'beam' ? '<p class="muted small">Stays on the primary. Extra mounts cannot carry it.</p>' : ''}
        ${owned && extraMounts(s).includes(id) ? '<p class="muted small">Mounted. Auto-fires and is locked off 1–8.</p>' : ''}`;
    }
    if (kind === 'escort' && ESCORT_BAY[id]) {
      const def = ESCORT_BAY[id];
      const lvl = escortLevel(s, id);
      const cost = escortUpgradeCost(s, id);
      const cur = def.format(def.value(lvl));
      const next = cost != null ? def.format(def.value(lvl + 1)) : null;
      return `<p class="eyebrow">Escort wing</p><h3>${def.name}</h3><p class="muted">${def.desc}</p>
        <div class="u-stat">${cur}${next ? ` <span class="arrow">→</span> <b>${next}</b>` : ' <span class="muted">(max)</span>'}</div>`;
    }
    if (kind === 'ship' && SHIPS[id]) {
      const hull = SHIPS[id];
      const owned = hasShipUnlock(id);
      return `<p class="eyebrow">Hull</p><h3>${hull.name}</h3><p class="muted">${owned ? hull.desc : hull.hint}</p>
        <div class="u-stat">${owned ? shipFeel(id) : 'Locked'}</div>`;
    }
    return `<p class="muted">Hover a card to preview it here.</p>`;
  }

  selectContract(destId) {
    const c = this.state.contracts.find((c) => c.dest === destId);
    if (!c) return;
    this.selected = destId;
    this.app.audio.play('click');
    this.render();
  }

  render() {
    const body = this.root.querySelector('.tab-body');
    const scroll = this.tab !== 'map' ? (body?.scrollTop || 0) : 0;
    this.stopPreviews?.();
    this.stopPreviews = null;
    const s = this.state;
    const here = this.galaxy.systems[s.current];
    const stats = shipStats(s);
    const rating = shipRating(s);
    const rc = repairCost(s);
    const paceOn = s.paced !== false && paceMatchingEnabled();
    const paceLabel = formatPace(pacePressure(s), paceOn);
    const heatLabel = formatHeat(s);
    this.root.innerHTML = `
      <header class="st-header">
        <div class="st-title">
          <div class="eyebrow">Docked at · Tier ${diffBadge(here.tier)}</div>
          <h1>${here.name}</h1>
        </div>
        <div class="st-stats">
          <div class="stat"><label>Credits</label><b class="credits">${fmt(s.credits)} cr</b></div>
          <div class="stat hull-stat">
            <label>Hull ${fmt(s.hull)}/${fmt(stats.maxHull)}</label>
            <div class="bar hull"><span class="${s.hull / stats.maxHull < 0.3 ? 'low' : ''}" style="width:${(100 * s.hull) / stats.maxHull}%"></span></div>
            ${rc > 0 ? `<button class="btn small" data-act="repair" ${s.credits < rc ? 'disabled' : ''}>Repair · ${fmt(rc)} cr</button>` : '<span class="muted small">Fully repaired</span>'}
          </div>
          <div class="stat"><label>Ship rating</label><b class="rating">${rating}</b></div>
          <div class="stat"><label>Pace</label><b>${paceLabel}</b></div>
          ${heatLabel ? `<div class="stat"><label>Heat</label><b>${heatLabel}</b></div>` : ''}
        </div>
        <button class="btn ghost small" data-act="menu">Menu</button>
      </header>
      <nav class="tabs">
        ${[['contracts', 'Contracts'], ['ship', 'Ship Systems'], ['map', 'Star Map']]
          .map(([id, label]) => `<button class="tab ${this.tab === id ? 'active' : ''}" data-act="tab" data-id="${id}">${label}</button>`)
          .join('')}
      </nav>
      <main class="tab-body tab-${this.tab}">${this.renderTab(stats, rating)}</main>
      <footer class="st-footer">${this.renderFooter(stats)}</footer>`;

    if (this.tab === 'map') {
      const map = this.game.starmap;
      map.refresh({ state: s, rating, selected: this.selected });
      this.app.setView(map);
      if (!this.mapFocused) {
        map.focus(s.current);
        this.mapFocused = true;
      }
      const info = this.root.querySelector('.map-info');
      map.attach(this.root.querySelector('.map-area'), this.root.querySelector('.map-labels'), {
        onHover: (sys) => (info.innerHTML = sys ? this.systemInfo(sys, rating) : this.mapHint()),
        onSelect: (sys) => {
          if (s.contracts.some((c) => c.dest === sys.id)) this.selectContract(sys.id);
        },
      });
    } else {
      this.game.starmap?.detach();
      this.app.setView(this.game.backdrop);
      this.game.backdrop.showShip = false;
      if (this.tab === 'ship') this.stopPreviews = startPreviews(this.root);
    }
    const nextBody = this.root.querySelector('.tab-body');
    if (nextBody && this.tab !== 'map') nextBody.scrollTop = scroll;
  }

  renderTab(stats, rating) {
    if (this.tab === 'contracts') return this.renderContracts(stats, rating);
    if (this.tab === 'ship') return this.renderShip(stats, rating);
    return `
      <div class="map-area"></div>
      <div class="map-labels"></div>
      <div class="map-info panel">${this.mapHint()}</div>
      <div class="map-legend panel">
        <div class="legend-row">${Array.from({ length: 10 }, (_, i) => `<span style="background:${tierCss(i + 1)}">${i + 1}</span>`).join('')}</div>
        <div class="muted small">Bright = visited · Dim = scanned · Hidden = uncharted</div>
        <div class="muted small">Lane Scanner · ${scanRange(this.state)} jumps · Ring = contract, colored by danger</div>
        <div class="legend-actions"><button class="btn small" data-act="here">Center on me</button><button class="btn small" data-act="fit">Show all</button></div>
      </div>`;
  }

  mapHint() {
    return '<div class="muted">Drag to pan, scroll to zoom. Only charted lanes are drawn. Hover a neighbor for details; click a ringed system to select its contract.</div>';
  }

  systemInfo(sys, rating) {
    const s = this.state;
    const contract = s.contracts.find((c) => c.dest === sys.id);
    const visited = s.visited.includes(sys.id);
    const named = visited || sys.id === s.current || !!contract;
    let route = '';
    if (sys.id === s.current) route = '<div class="accent">You are here</div>';
    else if (contract) {
      route = `<div>Route difficulty ${diffBadge(contract.difficulty)} ${dangerTag(contract.difficulty, rating)}</div>
        <div>${contract.good} · ${contract.pay} cr/unit</div>`;
    } else if (this.galaxy.systems[s.current].links.includes(sys.id)) {
      route = `<div>Route difficulty ${diffBadge(routeDifficulty(this.galaxy, s.current, sys.id))} · no contract offered</div>`;
    }
    const title = named ? `${sys.name}${sys.terminus ? ' ★' : ''}` : 'Unexplored';
    const meta = named
      ? `Tier ${diffBadge(sys.tier)} · ${visited ? 'Visited' : 'Unexplored'} · ${sys.links.length} lanes`
      : 'Uncharted neighbor';
    return `<h3>${title}</h3>
      <div>${meta}</div>
      ${named && sys.terminus ? '<div class="accent">The KL9 core. Deliver the shutdown code here to win.</div>' : ''}${named && sys.home ? '<div class="accent">Your home world.</div>' : ''}
      ${route}`;
  }

  renderContracts(stats, rating) {
    const s = this.state;
    if (!s.contracts.length) return '<p class="muted">No contracts available.</p>';
    const paceOn = s.paced !== false && paceMatchingEnabled();
    const paceLabel = formatPace(pacePressure(s), paceOn);
    const cards = s.contracts
      .map((c) => {
        const dest = this.galaxy.systems[c.dest];
        const danger = routeDanger(c.difficulty, rating);
        const total = c.pay * stats.cargo;
        const sel = this.selected === c.dest;
        return `
        <button class="contract panel danger-${danger.level} ${sel ? 'selected' : ''}" data-act="select" data-id="${c.dest}">
          <div class="c-head">
            <div>
              <div class="eyebrow">Destination${s.visited.includes(c.dest) ? '' : ' · Unexplored'}</div>
              <h2>${dest.name}${dest.terminus ? ' ★' : ''}</h2>
            </div>
            <div class="c-diff"><label>Difficulty</label>${diffBadge(c.difficulty)}<div class="muted small">Pace ${paceLabel}</div></div>
          </div>
          <div class="c-body">
            <div><label>Cargo</label><b>${c.good}</b></div>
            <div><label>Pay</label><b>${c.pay} cr/unit</b></div>
            <div><label>Distance</label><b>${c.dist} ly · ~${c.waves} wave${c.waves === 1 ? "" : "s"}</b></div>
          </div>
          <div class="c-foot">
            ${pips(c.difficulty, 10, tierCss(c.difficulty))}
            <span class="payout">${stats.cargo} × ${c.pay} = <b>${fmt(total)} cr</b></span>
          </div>
          <div class="c-danger">${dangerTag(c.difficulty, rating)}${c.difficulty > rating ? `<span class="muted small">Rating ${rating} vs difficulty ${c.difficulty}</span>` : ''}</div>
          ${dest.terminus ? '<div class="accent small">The KL9 core. Deliver the shutdown code here to win. Expect their heaviest defense and a capital ship.</div>' : ''}
        </button>`;
      })
      .join('');
    const lowHull = s.hull / stats.maxHull < 0.5;
    return `
      <div class="contracts">${cards}</div>
      ${lowHull ? '<p class="warn center">⚠ Hull integrity is low. Consider repairing before launch.</p>' : ''}
      ${s.contracts.every((c) => c.difficulty > rating) ? '<p class="warn center">Every route from here is above your ship rating. Upgrade under Ship Systems, or risk it.</p>' : ''}`;
  }

  renderShip(stats, rating) {
    const s = this.state;
    const u = s.upgrades;
    const slots = extraMountSlots(s);
    const assigned = Array.isArray(s.mounts) ? s.mounts : [];
    const mountedGuns = extraMounts(s);
    const sys = SYSTEM_ORDER.map((key) => {
      const def = SYSTEMS[key];
      const lvl = u[key];
      const cost = upgradeCost(key, lvl);
      const cur = def.format(def.value(lvl));
      const next = cost != null ? def.format(def.value(lvl + 1)) : null;
      return `
        <div class="upgrade panel ${def.rated ? 'rated' : ''} ${this.inspect === `sys:${key}` ? 'inspecting' : ''}" data-inspect="sys:${key}">
          <div class="u-head"><h3>${def.name}</h3>${def.rated ? '<span class="tag">Rating</span>' : ''}</div>
          <p class="muted">${def.desc}</p>
          <div class="u-level">Lv ${lvl} ${pips(lvl, def.max)}</div>
          <div class="u-stat">${cur}${next ? ` <span class="arrow">→</span> <b>${next}</b>` : ' <span class="muted">(max)</span>'}</div>
          ${cost != null
            ? `<button class="btn ${s.credits >= cost ? 'primary' : ''}" data-act="upgrade" data-id="${key}" ${s.credits < cost ? 'disabled' : ''}>Upgrade · ${fmt(cost)} cr</button>`
            : '<button class="btn" disabled>Maxed</button>'}
        </div>`;
    }).join('');
    const weapons = WEAPON_ORDER.map((id, i) => {
      const w = WEAPONS[id];
      const owned = hasWeapon(s, id);
      const locked = !hasWeaponUnlock(id);
      const lvl = owned ? weaponLevel(s, id) : 0;
      const gcost = owned ? weaponLevelCost(s, id) : null;
      const cur = owned ? weaponTuneStat(id, lvl) : w.stat;
      const next = owned && lvl < WEAPON_MAX_LEVEL ? weaponTuneStat(id, lvl + 1) : null;
      const isMounted = mountedGuns.includes(id);
      const lastPrimary = owned && canMountWeapon(id) && !isMounted && WEAPON_ORDER.filter((w) => hasWeapon(s, w) && !mountedGuns.includes(w)).length <= 1;
      const mountBtns = owned && canMountWeapon(id) && slots
        ? Array.from({ length: slots }, (_, slot) => {
            const on = assigned[slot] === id;
            const deny = !on && lastPrimary;
            return `<button class="btn small ${on ? 'primary' : ''}" data-act="mount" data-id="${id}" data-slot="${slot}" ${deny ? 'disabled' : ''}>${on ? `Mounted ${slot + 2}` : deny ? 'Need a primary' : `Mount ${slot + 2}`}</button>`;
          }).join('')
        : '';
      return `
        <div class="upgrade panel weapon ${owned ? 'owned' : ''} ${locked ? 'locked' : ''} ${isMounted ? 'mounted-gun' : ''} ${this.inspect === `gun:${id}` ? 'inspecting' : ''}" data-inspect="gun:${id}">
          <div class="u-head"><h3><kbd>${i + 1}</kbd> ${w.name}</h3>${isMounted ? '<span class="tag">Mounted</span>' : `<span class="swatch" style="background:#${w.color.toString(16).padStart(6, '0')}"></span>`}</div>
          <p class="muted">${w.desc}</p>
          <div class="u-stat">${owned ? `${cur}${next ? ` <span class="arrow">→</span> <b>${next}</b>` : ' <span class="muted">(max)</span>'}` : cur}</div>
          ${owned ? `<div class="u-level">Lv ${lvl} ${pips(lvl, WEAPON_MAX_LEVEL)}</div>` : ''}
          ${!owned
            ? locked
              ? `<button class="btn" disabled>${w.unlock === 'nova' ? 'Locked · 75 kills' : 'Locked'}</button>`
              : `<button class="btn ${s.credits >= w.cost ? 'primary' : ''}" data-act="buy" data-id="${id}" ${s.credits < w.cost ? 'disabled' : ''}>Buy · ${fmt(w.cost)} cr</button>`
            : gcost != null
              ? `<button class="btn ${s.credits >= gcost ? 'primary' : ''}" data-act="gun-up" data-id="${id}" ${s.credits < gcost ? 'disabled' : ''}>Tune · ${fmt(gcost)} cr</button>`
              : '<button class="btn" disabled>Maxed</button>'}
          ${owned && WEAPON_MODS[id] ? this.weaponMod(id) : ''}
          ${w.kind === 'beam' ? '<p class="muted small">Ion Beam stays on the primary. Extra mounts cannot carry it.</p>' : ''}
          ${isMounted ? '<p class="muted small">Locked off 1–8 while mounted.</p>' : ''}
          ${mountBtns ? `<div class="mount-btns">${mountBtns}</div>` : ''}
        </div>`;
    }).join('');
    const escorts = ESCORT_BAY_ORDER.map((key) => {
      const def = ESCORT_BAY[key];
      const lvl = escortLevel(s, key);
      const cost = escortUpgradeCost(s, key);
      const cur = def.format(def.value(lvl));
      const next = cost != null ? def.format(def.value(lvl + 1)) : null;
      return `
        <div class="upgrade panel ${this.inspect === `escort:${key}` ? 'inspecting' : ''}" data-inspect="escort:${key}">
          <div class="u-head"><h3>${def.name}</h3></div>
          <p class="muted">${def.desc}</p>
          <div class="u-level">Lv ${lvl} ${pips(lvl, def.max)}</div>
          <div class="u-stat">${cur}${next ? ` <span class="arrow">→</span> <b>${next}</b>` : ' <span class="muted">(max)</span>'}</div>
          ${cost != null
            ? `<button class="btn ${s.credits >= cost ? 'primary' : ''}" data-act="escort" data-id="${key}" ${s.credits < cost ? 'disabled' : ''}>Upgrade · ${fmt(cost)} cr</button>`
            : '<button class="btn" disabled>Maxed</button>'}
        </div>`;
    }).join('');
    const hangar = SHIP_ORDER.filter((id) => !SHIPS[id].hidden || hasShipUnlock(id)).map((id) => {
      const hull = SHIPS[id];
      const owned = hasShipUnlock(id);
      const fitted = s.ship === id;
      return `
        <div class="upgrade panel hangar ${fitted ? 'owned' : ''} ${owned ? '' : 'locked'} ${this.inspect === `ship:${id}` ? 'inspecting' : ''}" data-inspect="ship:${id}">
          <div class="u-head"><h3>${hull.name}</h3>${fitted ? '<span class="tag">Fitted</span>' : ''}</div>
          <p class="muted">${owned ? hull.desc : hull.hint}</p>
          <div class="u-stat">${owned ? shipFeel(id) : 'Locked'}</div>
          ${fitted
            ? '<button class="btn" disabled>Fitted</button>'
            : owned
            ? `<button class="btn primary" data-act="equip" data-id="${id}">Fit hull</button>`
            : `<button class="btn" disabled>${hull.hint}</button>`}
        </div>`;
    }).join('');
    const sum = u.core + u.hull + u.shield + 1;
    const needed = rating < 10 ? (rating + 1) * 3 - sum : 0;
    return `
      <div class="ship-layout">
      <div class="ship-main">
      <div class="rating-box panel">
        <div class="big-rating">${rating}</div>
        <div>
          <h3>Ship Rating</h3>
          <p class="muted">Average of Weapons Core, Hull and Shield levels (the shield counts +1). Routes above your rating are increasingly dangerous: each level above raises the danger rating.</p>
          ${rating < 10 ? `<p>Need <b>${needed}</b> more level${needed === 1 ? '' : 's'} across rated systems to reach rating <b>${rating + 1}</b>.</p>` : '<p class="accent">Maximum rating reached.</p>'}
        </div>
      </div>
      <h2 class="section">Systems</h2>
      <div class="grid">${sys}</div>
      <h2 class="section">Armaments <span class="muted small">Tune each gun. Extra hardpoints auto-fire assigned mounts and lock them off 1–8.</span></h2>
      <div class="grid">${weapons}</div>
      <h2 class="section">Escorts <span class="muted small">The whole wing on this save. Anyone who joins gets these stats.</span></h2>
      <div class="grid">${escorts}</div>
      <h2 class="section">Hangar <span class="muted small">Hulls unlock from achievements and stay on this device.</span></h2>
      <div class="grid">${hangar}</div>
      </div>
      <aside class="ship-stage panel">
        <p class="eyebrow">Preview</p>
        <div class="stage-frame"${String(this.inspect || '').startsWith('sys:') ? ' hidden' : ''}><canvas class="stage-preview" data-preview="${this.inspect || 'sys:core'}" aria-hidden="true"></canvas></div>
        <div class="stage-copy">${this.inspectCopy(this.inspect || 'sys:core')}</div>
      </aside>
      </div>`;
  }

  // Special mod row on an installed weapon's card (e.g. Seeker Rapid Recharge).
  weaponMod(id) {
    const s = this.state;
    const u = WEAPON_MODS[id];
    const lvl = weaponModLevel(s, id);
    const cost = weaponModCost(id, lvl);
    const cur = u.format(u.value(lvl));
    const next = cost != null ? u.format(u.value(lvl + 1)) : null;
    return `
      <div class="u-sub">
        <div class="u-level">${u.name} · Lv ${lvl} ${pips(lvl, u.max)}</div>
        <div class="u-stat">${cur}${next ? ` <span class="arrow">→</span> <b>${next}</b>` : ' <span class="muted">(max)</span>'}</div>
      </div>
      ${cost != null
        ? `<button class="btn ${s.credits >= cost ? 'primary' : ''}" data-act="wmod" data-id="${id}" ${s.credits < cost ? 'disabled' : ''}>${u.name} · ${fmt(cost)} cr</button>`
        : '<button class="btn" disabled>Maxed</button>'}`;
  }

  renderFooter(stats) {
    const s = this.state;
    const c = s.contracts.find((c) => c.dest === this.selected);
    const dest = c && this.galaxy.systems[c.dest];
    const risky = c && routeDanger(c.difficulty, shipRating(s)).level >= 3;
    return `
      <div class="sel-summary">
        ${c
          ? `<span class="eyebrow">Selected</span> <b>${dest.name}</b> · ${c.good} ×${stats.cargo} · <b class="accent">${fmt(c.pay * stats.cargo)} cr</b> · Difficulty ${diffBadge(c.difficulty)} · Pace ${formatPace(pacePressure(s), s.paced !== false && paceMatchingEnabled())} ${dangerTag(c.difficulty, shipRating(s))}`
          : '<span class="muted">Select a destination contract to launch.</span>'}
      </div>
      <button class="btn ${risky ? 'danger' : 'primary'} launch" data-act="launch" ${c ? '' : 'disabled'}>${risky ? 'Launch anyway ▶' : 'Launch ▶'}</button>`;
  }

  showReport(r) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <div class="modal panel ${r.kind}">
        <h2>${r.title}</h2>
        ${r.lines.map((l) => `<div class="r-line"><span>${l[0]}</span><b class="${l[2] || ''}">${l[1]}</b></div>`).join('')}
        ${r.note ? `<p class="muted">${r.note}</p>` : ''}
        ${r.unlocks?.length
          ? `<div class="unlock-list">${r.unlocks.map((u) => `<p class="accent">${u.name} — ${u.reward}</p>`).join('')}</div>`
          : ''}
        <button class="btn primary" data-act="close-modal">Continue</button>
      </div>`;
    this.root.appendChild(wrap);
  }

  destroy() {
    this.stopPreviews?.();
    this.game.starmap?.detach();
    this.root.remove();
  }
}
