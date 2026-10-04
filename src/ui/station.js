import { SYSTEMS, SYSTEM_ORDER, WEAPONS, WEAPON_ORDER } from '../data.js';
import {
  shipStats, shipRating, routeDanger, upgradeCost, repairCost, repair, buyUpgrade, buyWeapon, hasWeapon, save,
} from '../state.js';
import { routeDifficulty } from '../galaxy.js';
import { tierCss } from '../views/starmap.js';

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

  selectContract(destId) {
    const c = this.state.contracts.find((c) => c.dest === destId);
    if (!c) return;
    this.selected = destId;
    this.app.audio.play('click');
    this.render();
  }

  render() {
    const s = this.state;
    const here = this.galaxy.systems[s.current];
    const stats = shipStats(s);
    const rating = shipRating(s);
    const rc = repairCost(s);
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
    }
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
        <div class="muted small">Route difficulty · Dim = unvisited · Ring = contract, colored by danger</div>
        <div class="legend-actions"><button class="btn small" data-act="here">Center on me</button><button class="btn small" data-act="fit">Show all</button></div>
      </div>`;
  }

  mapHint() {
    return '<div class="muted">Drag to pan, scroll to zoom. Hover a system for details; click a ringed system to select its contract.</div>';
  }

  systemInfo(sys, rating) {
    const s = this.state;
    const contract = s.contracts.find((c) => c.dest === sys.id);
    const visited = s.visited.includes(sys.id);
    let route = '';
    if (sys.id === s.current) route = '<div class="accent">You are here</div>';
    else if (contract) {
      route = `<div>Route difficulty ${diffBadge(contract.difficulty)} ${dangerTag(contract.difficulty, rating)}</div>
        <div>${contract.good} · ${contract.pay} cr/unit</div>`;
    } else if (this.galaxy.systems[s.current].links.includes(sys.id)) {
      route = `<div>Route difficulty ${diffBadge(routeDifficulty(this.galaxy, s.current, sys.id))} · no contract offered</div>`;
    }
    return `<h3>${sys.name}${sys.terminus ? ' ★' : ''}</h3>
      <div>Tier ${diffBadge(sys.tier)} · ${visited ? 'Visited' : 'Unexplored'} · ${sys.links.length} lanes</div>
      ${sys.terminus ? '<div class="accent">The KL9 core. Deliver the shutdown code here to win.</div>' : ''}${sys.home ? '<div class="accent">Your home world.</div>' : ''}
      ${route}`;
  }

  renderContracts(stats, rating) {
    const s = this.state;
    if (!s.contracts.length) return '<p class="muted">No contracts available.</p>';
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
            <div class="c-diff"><label>Difficulty</label>${diffBadge(c.difficulty)}</div>
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
    const sys = SYSTEM_ORDER.map((key) => {
      const def = SYSTEMS[key];
      const lvl = u[key];
      const cost = upgradeCost(key, lvl);
      const cur = def.format(def.value(lvl));
      const next = cost != null ? def.format(def.value(lvl + 1)) : null;
      return `
        <div class="upgrade panel ${def.rated ? 'rated' : ''}">
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
      return `
        <div class="upgrade panel weapon ${owned ? 'owned' : ''}">
          <div class="u-head"><h3><kbd>${i + 1}</kbd> ${w.name}</h3><span class="swatch" style="background:#${w.color.toString(16).padStart(6, '0')}"></span></div>
          <p class="muted">${w.desc}</p>
          <div class="u-stat">${w.stat}</div>
          ${owned
            ? '<button class="btn" disabled>Installed</button>'
            : `<button class="btn ${s.credits >= w.cost ? 'primary' : ''}" data-act="buy" data-id="${id}" ${s.credits < w.cost ? 'disabled' : ''}>Buy · ${fmt(w.cost)} cr</button>`}
        </div>`;
    }).join('');
    const sum = u.core + u.hull + u.shield + 1;
    const needed = rating < 10 ? (rating + 1) * 3 - sum : 0;
    return `
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
      <h2 class="section">Armaments <span class="muted small">All weapons are boosted by Weapons Core. Switch in flight with 1-4 or Q/E.</span></h2>
      <div class="grid">${weapons}</div>`;
  }

  renderFooter(stats) {
    const s = this.state;
    const c = s.contracts.find((c) => c.dest === this.selected);
    const dest = c && this.galaxy.systems[c.dest];
    const risky = c && routeDanger(c.difficulty, shipRating(s)).level >= 3;
    return `
      <div class="sel-summary">
        ${c
          ? `<span class="eyebrow">Selected</span> <b>${dest.name}</b> · ${c.good} ×${stats.cargo} · <b class="accent">${fmt(c.pay * stats.cargo)} cr</b> · Difficulty ${diffBadge(c.difficulty)} ${dangerTag(c.difficulty, shipRating(s))}`
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
        <button class="btn primary" data-act="close-modal">Continue</button>
      </div>`;
    this.root.appendChild(wrap);
  }

  destroy() {
    this.game.starmap?.detach();
    this.root.remove();
  }
}
