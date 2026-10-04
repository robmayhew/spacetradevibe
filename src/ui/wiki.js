import {
  ENEMIES,
  ENEMY_ORDER,
  WEAPONS,
  WEAPON_ORDER,
  SYSTEMS,
  SYSTEM_ORDER,
  SCORE,
  canMountWeapon,
} from '../data.js';
import { BOARD_SEASON_LABEL } from '../score.js';

export const WIKI_SECTIONS = [
  { id: 'hostiles', label: 'Hostiles' },
  { id: 'guns', label: 'Guns' },
  { id: 'rules', label: 'Lanes' },
];

export function wikiHtml(section = 'hostiles') {
  const id = WIKI_SECTIONS.some((s) => s.id === section) ? section : 'hostiles';
  return `<div class="panel settings-panel wiki-panel">
    <div class="board-tabs wiki-tabs">
      ${WIKI_SECTIONS.map(
        (s) => `<button class="tab ${s.id === id ? 'active' : ''}" data-wiki="${s.id}">${s.label}</button>`,
      ).join('')}
    </div>
    <div class="wiki-body">${sectionHtml(id)}</div>
  </div>`;
}

function sectionHtml(id) {
  if (id === 'guns') return gunsHtml();
  if (id === 'rules') return rulesHtml();
  return hostilesHtml();
}

function hostilesHtml() {
  const cards = ENEMY_ORDER.map((id) => {
    const e = ENEMIES[id];
    const fire = e.fire
      ? e.fire.homing
        ? `Homing bolts · ${e.fire.dmg} dmg`
        : id === 'boss'
          ? `Fans and spirals · ${e.fire.dmg} dmg`
          : id === 'sniper'
            ? `Fast bursts · ${e.fire.dmg} dmg`
            : `Bolts · ${e.fire.dmg} dmg`
      : 'No guns · ram only';
    return `<article class="wiki-card wiki-hostile">
      <div class="wiki-icon"><canvas data-preview="hostile:${id}" aria-hidden="true"></canvas></div>
      <div class="wiki-copy">
        <div class="wiki-head"><h3>${escapeHtml(e.name)}</h3></div>
        <p>${escapeHtml(e.desc)}</p>
        <p class="muted small">At difficulty 1 · Hull ${e.hp} · Speed ${e.speed} · Ram ${e.contact} · ${escapeHtml(fire)} · ${e.bounty} bounty</p>
      </div>
    </article>`;
  }).join('');
  return `<p class="muted small">Every route can spawn every type. Hull and shot damage grow with difficulty; pace matching can add more ships and a little extra hull. Figures below are difficulty 1.</p>
    <div class="wiki-list">${cards}</div>`;
}

function gunsHtml() {
  const systems = SYSTEM_ORDER.map((id) => {
    const s = SYSTEMS[id];
    return `<article class="wiki-card">
      <div class="wiki-head"><h3>${escapeHtml(s.name)}</h3>${s.rated ? '<span class="tag">Rating</span>' : ''}</div>
      <p>${escapeHtml(s.desc)}</p>
    </article>`;
  }).join('');
  const guns = WEAPON_ORDER.map((id, i) => {
    const w = WEAPONS[id];
    const mount = canMountWeapon(id) ? 'Can mount' : 'Primary only';
    const lock = w.unlock === 'nova' ? 'Unlock at 75 kills' : '';
    const bits = [w.stat, mount, lock].filter(Boolean);
    return `<article class="wiki-card">
      <div class="wiki-head">
        <span class="wiki-swatch" style="background:#${hex(w.color)}"></span>
        <h3><kbd>${i + 1}</kbd> ${escapeHtml(w.name)}</h3>
      </div>
      <p>${escapeHtml(w.desc)}</p>
      <p class="muted small">${escapeHtml(bits.join(' · '))}</p>
    </article>`;
  }).join('');
  return `<p class="muted small">Tune a gun up to level 5. A mounted gun auto-fires from a hardpoint and is locked off 1–8 so it cannot double up. Ion Beam stays on the primary.</p>
    <h3 class="wiki-sub">Systems</h3>
    <div class="wiki-list">${systems}</div>
    <h3 class="wiki-sub">Armaments</h3>
    <div class="wiki-list">${guns}</div>`;
}

function rulesHtml() {
  return `<div class="wiki-list">
    <article class="wiki-card">
      <div class="wiki-head"><h3>How a run works</h3></div>
      <p>Pick a contract, launch, and clear 1–4 waves. Dock, get paid, and spend it on Ship Systems. Fly deeper until you deliver the Founders’ Beacon to the Terminus.</p>
    </article>
    <article class="wiki-card">
      <div class="wiki-head"><h3>Ship rating</h3></div>
      <p>Rating is the average of Weapons Core, Hull, and Shield (shield counts as +1 because it starts at zero). You can fly above your rating; danger climbs from Moderate to Suicidal.</p>
    </article>
    <article class="wiki-card">
      <div class="wiki-head"><h3>Pace matching</h3></div>
      <p>When on, recent deaths ease the next flights and fast or clean clears tighten them a little. Payouts are never cut. The HUD shows the current scale under difficulty. Turn it off in Gameplay; those runs post as Unpaced.</p>
    </article>
    <article class="wiki-card">
      <div class="wiki-head"><h3>Star map fog</h3></div>
      <p>The map charts two jumps from stations you have docked at. Buy Lane Scanner under Ship Systems to see three, four, or five jumps. Distant systems, including the Terminus, stay hidden until the scanner reaches them. Hover an unnamed neighbor to mark it Unexplored.</p>
    </article>
    <article class="wiki-card">
      <div class="wiki-head"><h3>Lane heat</h3></div>
      <p>Reaching the Terminus raises heat on this save and on new games on this device. A short run (under 18 deliveries) or a deathless clear stacks more. Heat densifies later flights by 12% per step, up to +3. It shows under difficulty when it is on.</p>
    </article>
    <article class="wiki-card">
      <div class="wiki-head"><h3>Lane Records · ${escapeHtml(BOARD_SEASON_LABEL)}</h3></div>
      <p>Score is credits earned + ${SCORE.kill} per kill + ${SCORE.boss.toLocaleString()} per capital ship − ${SCORE.death.toLocaleString()} per ship lost. The board also shows leftover cash and average pace. Seasons keep ranks from mixing after balance changes. Runs under 3 minutes are not posted.</p>
    </article>
    <article class="wiki-card">
      <div class="wiki-head"><h3>Escorts</h3></div>
      <p>Scan the QR or enter the room code on another device. Wing plating, guns, engines, and cyclic are bought on this save and apply to everyone who joins.</p>
    </article>
    <article class="wiki-card">
      <div class="wiki-head"><h3>Controls</h3></div>
      <p><kbd>WASD</kbd> / <kbd>Arrows</kbd> move · <kbd>Space</kbd> fire · <kbd>F</kbd> auto-fire · <kbd>1</kbd>–<kbd>8</kbd> / <kbd>Q</kbd> <kbd>E</kbd> weapons · <kbd>Esc</kbd> pause</p>
    </article>
  </div>`;
}

function hex(n) {
  return (Number(n) || 0).toString(16).padStart(6, '0');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
