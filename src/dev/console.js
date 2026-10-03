import * as DATA from '../data.js';
import { SYSTEMS, WEAPONS, WEAPON_ORDER, ENEMIES } from '../data.js';
import { save, shipStats, shipRating, generateContracts } from '../state.js';
import { routeDifficulty } from '../galaxy.js';

// Cheat / test console. Toggle with the backtick key (`).
// Commands that change the save mark it `cheated`, which blocks leaderboard posting.

const HISTORY_KEY = 'txl-trader-console-history';
const ENEMY_TYPES = Object.keys(ENEMIES).filter((t) => t !== 'boss');

export class DevConsole {
  constructor(app) {
    this.app = app;
    this.history = loadHistory();
    this.histIndex = this.history.length;
    this.buildDom();
    this.commands = buildCommands(this);
    window.addEventListener('keydown', (e) => {
      if (!isToggleKey(e)) return;
      if (e.target.closest?.('input, textarea') && e.target !== this.input) return; // typing elsewhere
      e.preventDefault();
      this.toggle();
    });
    this.print('TXL test console. Type <b>help</b> for commands. Toggle with <kbd>`</kbd>.', 'muted');
  }

  get game() {
    return this.app.game;
  }
  get state() {
    return this.game.state;
  }

  buildDom() {
    const el = document.createElement('div');
    el.className = 'dev-console hidden';
    el.innerHTML = `<div class="dc-log"></div><div class="dc-line"><span>&gt;</span><input type="text" spellcheck="false" autocomplete="off"></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.log = el.querySelector('.dc-log');
    this.input = el.querySelector('input');
    this.input.addEventListener('keydown', (e) => this.onKey(e));
  }

  toggle() {
    const open = this.el.classList.toggle('hidden') === false;
    this.app.input.held.clear(); // don't leave the ship drifting on a key held when opening
    if (open) setTimeout(() => this.input.focus(), 0);
    else this.input.blur();
  }

  onKey(e) {
    e.stopPropagation();
    if (isToggleKey(e) || e.key === 'Escape') {
      e.preventDefault();
      this.toggle();
    } else if (e.key === 'Enter') {
      const line = this.input.value.trim();
      this.input.value = '';
      if (line) this.run(line);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.histIndex = Math.max(0, Math.min(this.history.length, this.histIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      this.input.value = this.history[this.histIndex] ?? '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.complete();
    }
  }

  complete() {
    const v = this.input.value;
    const parts = v.split(/\s+/);
    let options;
    if (parts.length <= 1) options = Object.keys(this.commands);
    else options = this.commands[parts[0]]?.complete?.(parts.length - 2) ?? [];
    const word = parts[parts.length - 1].toLowerCase();
    const hits = options.filter((o) => o.toLowerCase().startsWith(word));
    if (hits.length === 1) {
      parts[parts.length - 1] = hits[0];
      this.input.value = parts.join(' ') + ' ';
    } else if (hits.length > 1) {
      this.print(hits.join('  '), 'muted');
    }
  }

  run(line) {
    this.history = [...this.history.filter((h) => h !== line), line].slice(-50);
    this.histIndex = this.history.length;
    saveHistory(this.history);
    this.print(`&gt; ${escapeHtml(line)}`, 'echo');
    const [name, ...args] = line.split(/\s+/);
    const cmd = this.commands[name.toLowerCase()];
    if (!cmd) return this.print(`Unknown command "${escapeHtml(name)}". Try <b>help</b>.`, 'err');
    try {
      if (cmd.needs === 'game' && !this.state) return this.print('Start or continue a game first.', 'err');
      if (cmd.needs === 'travel' && !this.game.travel) return this.print('Only works during combat travel.', 'err');
      if (cmd.needs === 'dock' && !this.game.dock) return this.print('Only works while docking or undocking.', 'err');
      if (cmd.needs === 'station' && !this.game.station) return this.print('Only works at a station.', 'err');
      const out = cmd.run(args);
      if (cmd.cheat && this.state) {
        this.state.cheated = true;
        save(this.state);
        this.game.station?.render();
      }
      if (out) this.print(out);
    } catch (err) {
      this.print(escapeHtml(err.message), 'err');
    }
  }

  print(html, cls = '') {
    const div = document.createElement('div');
    div.className = cls;
    div.innerHTML = html;
    this.log.appendChild(div);
    while (this.log.children.length > 300) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
}

// ------------------------------------------------------------------ commands

function buildCommands(dc) {
  const g = () => dc.game;
  const s = () => dc.state;
  const num = (v, name) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
    return n;
  };
  const findSystem = (q) => {
    const sys = g().galaxy.systems;
    if (/^\d+$/.test(q)) return sys[+q] ?? null;
    const lc = q.toLowerCase();
    return sys.find((x) => x.name.toLowerCase() === lc) ?? sys.find((x) => x.name.toLowerCase().startsWith(lc)) ?? null;
  };
  const moveTo = (sys) => {
    const st = s();
    st.current = sys.id;
    if (!st.visited.includes(sys.id)) st.visited.push(sys.id);
    generateContracts(st, g().galaxy);
    if (g().station) g().showStation();
    return `Now docked at <b>${sys.name}</b> (#${sys.id}, tier ${sys.tier}).`;
  };
  const killAll = (tr, includeAsteroids = true) => {
    let n = 0;
    for (const e of tr.enemies) {
      if (e.dead || (!includeAsteroids && e.type === 'asteroid')) continue;
      tr.killEnemy(e);
      n++;
    }
    return n;
  };

  return {
    help: {
      help: 'List commands, or help <command>.',
      complete: () => Object.keys(dc.commands),
      run: ([name]) => {
        if (name) {
          const c = dc.commands[name];
          return c ? `<b>${name}</b> ${escapeHtml(c.args ?? '')}<br>${c.help}` : `No command "${escapeHtml(name)}".`;
        }
        const groups = {};
        for (const [n, c] of Object.entries(dc.commands)) (groups[c.group ?? 'General'] ||= []).push(`<b>${n}</b> ${escapeHtml(c.args ?? '')} <span class="muted">${c.help}</span>`);
        return Object.entries(groups).map(([k, v]) => `<div class="dc-head">${k}</div>${v.join('<br>')}`).join('');
      },
    },
    clear: { help: 'Clear the console.', run: () => void (dc.log.innerHTML = '') },
    status: {
      help: 'Where you are and what the ship has.',
      run: () => {
        const st = s();
        const view = dc.app.view?.constructor.name ?? 'none';
        const phase = dc.app.view?.phase ? ` (${dc.app.view.phase})` : '';
        const lines = [`View: ${view}${phase} · speed ×${dc.app.timeScale} · god ${dc.app.cheats.god ? 'ON' : 'off'}`];
        if (st) {
          const here = g().galaxy.systems[st.current];
          const u = st.upgrades;
          lines.push(`At <b>${here.name}</b> (#${here.id}, tier ${here.tier}) · ${st.credits} cr · hull ${Math.round(st.hull)}/${shipStats(st).maxHull} · rating ${shipRating(st)}${st.cheated ? ' · <span class="warn">test run</span>' : ''}`);
          lines.push(`Core ${u.core} · Hull ${u.hull} · Shield ${u.shield} · Engine ${u.engine} · Cargo ${u.cargo} · Weapons ${st.weapons.join(', ')}`);
        }
        const tr = g().travel;
        if (tr) lines.push(`Wave ${tr.waveIndex + 1}/${tr.waves.length}${tr.hasBoss ? ' + boss' : ''} · hostiles left ${tr.hostilesLeft()} · difficulty ${tr.d}`);
        return lines.join('<br>');
      },
    },

    // ---- economy & ship
    credits: {
      group: 'Ship & economy', args: '<n | +n | -n>', help: 'Set or adjust credits.', needs: 'game', cheat: true,
      run: ([v]) => {
        const st = s();
        if (v == null) return `${st.credits} cr`;
        st.credits = Math.max(0, /^[+-]/.test(v) ? st.credits + num(v, 'amount') : num(v, 'amount'));
        return `Credits: ${st.credits}`;
      },
    },
    repair: {
      group: 'Ship & economy', help: 'Fully repair the hull (also mid-flight).', needs: 'game', cheat: true,
      run: () => {
        const max = shipStats(s()).maxHull;
        s().hull = max;
        const tr = g().travel;
        if (tr) Object.assign(tr.player, { hull: tr.player.maxHull, shield: tr.player.maxShield });
        if (g().dock) g().dock.player.hull = g().dock.player.maxHull;
        if (g().flight) g().flight.hull = max;
        return 'Hull repaired.';
      },
    },
    upgrade: {
      group: 'Ship & economy', args: '<system|all> <level|max>', help: `Set an upgrade level. Systems: ${Object.keys(SYSTEMS).join(', ')}.`, needs: 'game', cheat: true,
      complete: (i) => (i === 0 ? [...Object.keys(SYSTEMS), 'all'] : ['max']),
      run: ([sys, lvl = 'max']) => {
        const keys = sys === 'all' ? Object.keys(SYSTEMS) : [sys];
        for (const k of keys) {
          const def = SYSTEMS[k];
          if (!def) throw new Error(`Unknown system "${sys}"`);
          s().upgrades[k] = Math.max(def.start, Math.min(def.max, lvl === 'max' ? def.max : num(lvl, 'level')));
        }
        s().hull = shipStats(s()).maxHull;
        return `Upgrades: ${keys.map((k) => `${k} ${s().upgrades[k]}`).join(', ')} · rating ${shipRating(s())}. Takes effect next flight.`;
      },
    },
    rating: {
      group: 'Ship & economy', args: '<1-10>', help: 'Set Weapons Core, Hull and Shield to give this ship rating.', needs: 'game', cheat: true,
      run: ([v]) => {
        const r = Math.max(1, Math.min(10, num(v, 'rating')));
        Object.assign(s().upgrades, { core: r, hull: r, shield: r - 1 });
        s().hull = shipStats(s()).maxHull;
        return `Ship rating ${shipRating(s())}. Takes effect next flight.`;
      },
    },
    weapon: {
      group: 'Ship & economy', args: '<id|all>', help: `Install a weapon. Ids: ${WEAPON_ORDER.join(', ')}.`, needs: 'game', cheat: true,
      complete: () => [...WEAPON_ORDER, 'all'],
      run: ([id]) => {
        const ids = id === 'all' ? WEAPON_ORDER : [id];
        for (const w of ids) {
          if (!WEAPONS[w]) throw new Error(`Unknown weapon "${id}"`);
          if (!s().weapons.includes(w)) s().weapons.push(w);
        }
        return `Weapons: ${s().weapons.join(', ')}. Takes effect next flight.`;
      },
    },
    god: {
      group: 'Ship & economy', help: 'Toggle invulnerability (combat hits and docking bumps).', cheat: true,
      run: () => `God mode ${(dc.app.cheats.god = !dc.app.cheats.god) ? 'ON' : 'off'}.`,
    },
    demo: {
      group: 'Flights',
      help: 'Infinite combat for a live demo: max ship, captain cannot die, enemies never stop. Escorts can still join. Pause and retreat leave the demo.',
      cheat: true,
      run: () => {
        g().startDemo();
        return 'Demo running. Captain cannot die and enemies do not stop. Escorts join with the room code.';
      },
    },

    // ---- map
    goto: {
      group: 'Map', args: '<system id|name>', help: 'Teleport to a station (from the station screen).', needs: 'station', cheat: true,
      complete: () => g()?.galaxy?.systems.map((x) => x.name.replace(/\s+/g, '_')) ?? [],
      run: (args) => {
        const sys = findSystem(args.join(' ').replace(/_/g, ' '));
        if (!sys) throw new Error('No such system. Use an id (0-30) or a name.');
        return moveTo(sys);
      },
    },
    terminus: {
      group: 'Map', help: 'Teleport next to the Terminus.', needs: 'station', cheat: true,
      run: () => moveTo(g().galaxy.systems[g().galaxy.systems[g().galaxy.end].links[0]]),
    },
    reveal: {
      group: 'Map', help: 'Mark every system visited.', needs: 'game', cheat: true,
      run: () => {
        s().visited = g().galaxy.systems.map((x) => x.id);
        return 'All systems revealed.';
      },
    },
    systems: {
      group: 'Map', help: 'List systems with id, tier and links.', needs: 'game',
      run: () => g().galaxy.systems.map((x) => `#${x.id} ${x.name} · tier ${x.tier} · → ${x.links.join(', ')}${x.id === s().current ? ' <b>(here)</b>' : ''}`).join('<br>'),
    },
    contracts: {
      group: 'Map', help: 'Re-roll this station’s contracts.', needs: 'station', cheat: true,
      run: () => {
        generateContracts(s(), g().galaxy);
        g().station.render();
        return 'Contracts re-rolled.';
      },
    },

    // ---- flights
    fly: {
      group: 'Flights', args: '[difficulty] [waves] [boss|noboss] [nodock]',
      help: 'Launch a test flight to a neighbor (never the Terminus) with the given difficulty (1-10), waves (1-6), boss on/off, and optionally skip both docking scenes.',
      needs: 'station', cheat: true,
      complete: () => ['boss', 'noboss', 'nodock'],
      run: (args) => {
        const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
        const here = g().galaxy.systems[s().current];
        // Avoid the Terminus: delivering there ends the game and forces 5 waves + boss.
        const destId = here.links.find((id) => !g().galaxy.systems[id].terminus) ?? here.links[0];
        const difficulty = Math.max(1, Math.min(10, nums[0] ?? routeDifficulty(g().galaxy, here.id, destId)));
        const waves = Math.max(1, Math.min(6, nums[1] ?? 2));
        const forceBoss = args.includes('boss') ? true : args.includes('noboss') ? false : undefined;
        const contract = { dest: destId, difficulty, good: 'Test Cargo', pay: 1, dist: 0, waves, forceBoss };
        if (args.includes('nodock')) {
          const game = g();
          game.station.destroy();
          game.station = null;
          game.app.ui.innerHTML = '';
          game.flight = { contract, from: here, to: game.galaxy.systems[destId], hull: s().hull, skipDock: true };
          game.startTravel();
        } else {
          g().launch(contract);
        }
        return `Test flight: difficulty ${difficulty}, ${waves} wave${waves === 1 ? '' : 's'}${forceBoss === true ? ', boss' : forceBoss === false ? ', no boss' : ''}${args.includes('nodock') ? ', no docking' : ''}.`;
      },
    },
    dock: {
      group: 'Flights', args: '[tier] [undock]', help: 'Play a docking (or undocking) scene at a station of the given tier, then return to the station.', needs: 'station', cheat: true,
      complete: () => ['undock'],
      run: (args) => {
        const game = g();
        const tier = Math.max(1, Math.min(10, Number(args.find((a) => /^\d+$/.test(a))) || game.galaxy.systems[s().current].tier));
        const sys = game.galaxy.systems.find((x) => x.tier === tier && !x.terminus);
        game.station.destroy();
        game.station = null;
        game.app.ui.innerHTML = '';
        game.flight = { hull: s().hull };
        game.startDock(args.includes('undock') ? 'undock' : 'dock', sys, (d) => {
          s().hull = Math.round(d.hull);
          game.flight = null;
          game.showStation();
          dc.print(`Docking test done: ${d.bumps} bump${d.bumps === 1 ? '' : 's'}, ${d.time.toFixed(1)}s.`);
        });
        return `Docking test at ${sys.name} (tier ${tier}).`;
      },
    },

    // ---- in combat
    kill: {
      group: 'In combat', help: 'Destroy every enemy on screen (counts as kills).', needs: 'travel', cheat: true,
      run: () => `Destroyed ${killAll(g().travel)}.`,
    },
    skip: {
      group: 'In combat', help: 'End the current wave now.', needs: 'travel', cheat: true,
      run: () => {
        const tr = g().travel;
        tr.spawnQueue = [];
        return `Wave skipped (${killAll(tr)} destroyed).`;
      },
    },
    win: {
      group: 'In combat', help: 'Clear the route and go straight to arrival.', needs: 'travel', cheat: true,
      run: () => {
        const tr = g().travel;
        tr.spawnQueue = [];
        killAll(tr);
        tr.waveIndex = tr.waves.length;
        tr.hasBoss = false;
        tr.startOutro();
        return 'Route cleared.';
      },
    },
    die: {
      group: 'In combat', help: 'Destroy your own ship (tests the tow flow).', needs: 'travel',
      run: () => {
        const tr = g().travel;
        const god = dc.app.cheats.god;
        dc.app.cheats.god = false;
        tr.player.invuln = 0;
        tr.player.shield = 0;
        tr.hitPlayer(1e9);
        dc.app.cheats.god = god;
        return 'Boom.';
      },
    },
    spawn: {
      group: 'In combat', args: '<type|boss> [count]', help: `Spawn enemies at the top. Types: ${ENEMY_TYPES.join(', ')}, boss.`, needs: 'travel', cheat: true,
      complete: (i) => (i === 0 ? [...ENEMY_TYPES, 'boss'] : []),
      run: ([type, n = '1']) => {
        const tr = g().travel;
        if (!ENEMIES[type]) throw new Error(`Unknown enemy "${type}"`);
        const count = Math.max(1, Math.min(30, num(n, 'count')));
        for (let i = 0; i < count; i++) {
          const x = type === 'boss' ? 0 : (Math.random() - 0.5) * tr.playHalfW * 1.6;
          tr.spawnEnemy(type, x, 58 + (type === 'boss' ? 8 : i * 2));
        }
        return `Spawned ${count} ${type}.`;
      },
    },

    // ---- docking
    land: {
      group: 'Docking', help: 'Finish the current dock / undock instantly.', needs: 'dock',
      run: () => {
        const dv = g().dock;
        if (dv.phase !== 'fly') return 'Wait until you have control.';
        dv.player.attached = false;
        if (dv.mode === 'undock') Object.assign(dv.player, { x: dv.L.gateX, y: 44, vx: 0, vy: 0 });
        else {
          const pw = dv.padWorld(dv.target);
          Object.assign(dv.player, { x: pw.x, y: pw.y, vx: 0, vy: 0 });
          dv.progress = 99;
        }
        return 'Done.';
      },
    },
    spin: {
      group: 'Docking', args: '<rad/s>', help: 'Set the current station’s rotation speed.', needs: 'dock',
      run: ([v]) => {
        g().dock.L.spin = num(v, 'speed');
        return `Station spin ${g().dock.L.spin} rad/s.`;
      },
    },

    // ---- tuning & time
    speed: {
      group: 'Tuning', args: '<multiplier>', help: 'Game speed: 0 freezes, 0.25 slow-mo, 4 fast-forward (max 8).',
      run: ([v = '1']) => {
        dc.app.timeScale = Math.max(0, Math.min(8, num(v, 'multiplier')));
        return `Speed ×${dc.app.timeScale}.`;
      },
    },
    tune: {
      group: 'Tuning', args: '<path> [value]', help: 'Read or set a tuning value live, e.g. <i>tune ENEMIES.scout.fire.homing 2</i> or <i>tune WEAPONS.pulse.dmg</i>. Resets on reload.',
      cheat: true,
      complete: () => ['ENEMIES.', 'WEAPONS.', 'SYSTEMS.', 'GOODS.', 'SCORE.'],
      run: ([path, value]) => {
        if (!path) throw new Error('Give a path like ENEMIES.scout.hp');
        const keys = path.split('.');
        const last = keys.pop();
        let obj = DATA;
        for (const k of keys) {
          obj = obj?.[k];
          if (obj == null) throw new Error(`No "${k}" in ${path}`);
        }
        if (!(last in obj)) throw new Error(`No "${last}" in ${path}`);
        if (obj === DATA && value !== undefined) throw new Error('Top-level constants (like HP_GROWTH) can\u2019t be changed live; edit src/data.js');
        if (value === undefined) return `${path} = ${escapeHtml(JSON.stringify(obj[last]))}`;
        if (typeof obj[last] === 'object' || typeof obj[last] === 'function') throw new Error('Can only set number or text values');
        obj[last] = typeof obj[last] === 'number' ? num(value, 'value') : value;
        return `${path} = ${obj[last]} (new spawns and flights pick it up)`;
      },
    },
  };
}

// Backtick by key code, or by character for layouts / tools that don't report the code.
function isToggleKey(e) {
  return e.code === 'Backquote' || e.key === '`' || e.key === '~';
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(h) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {
    // storage unavailable
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
