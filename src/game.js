import { generateGalaxy } from './galaxy.js';
import { SYSTEMS, WEAPON_ORDER, SCORE } from './data.js';
import { newState, generateContracts, shipStats, towFee, save, load, recordFlight, listSlots, freeSlotIndex, peekSlot, writeActive, occupiedSlots, clearSave } from './state.js';
import { checkAchievements } from './achievements.js';
import { BackdropView } from './views/backdrop.js';
import { StarMapView } from './views/starmap.js';
import { TravelView } from './views/travel.js';
import { DockView } from './views/dock.js';
import { renderMenu } from './ui/menu.js';
import { renderLeaderboard } from './ui/leaderboard.js';
import { renderSettings } from './ui/settings.js';
import { StationScreen } from './ui/station.js';
import {
  abandonRun,
  CALLSIGN_RE,
  ensureCallsign,
  formatRunTime,
  hasRunClock,
  loadCallsign,
  MIN_TIME_MS,
  runScore,
  saveCallsign,
  submitRun,
  uniqueCallsign,
} from './score.js';
import { VERSION } from './changelog.js';
import { shouldShowWhatsNew } from './prefs.js';

const fmt = (n) => Math.round(n).toLocaleString();
const PRECISION_BONUS = 0.1; // share of cargo pay awarded for docking without bumps

// Top-level flow: menu → station ⇄ travel → (victory).
export class Game {
  constructor(app) {
    this.app = app;
    this.backdrop = new BackdropView(app.pixelRatio);
    this.state = null;
    this.galaxy = null;
    this.starmap = null;
    this.station = null;
    this.travel = null;
    this.screen = 'menu';
    this.windowFocused = document.hasFocus();
    this.boardAcc = 0;
    window.addEventListener('blur', () => {
      this.windowFocused = false;
    });
    window.addEventListener('focus', () => {
      this.windowFocused = true;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flushClock();
    });
  }

  tick(dt) {
    const s = this.state;
    if (!s || s.won || !Number.isFinite(s.runMs)) return;
    if (this.screen === 'menu' || this.screen === 'victory') return;
    if (!this.windowFocused || document.hidden) return;
    if (this.app.view?.paused) return;
    s.runMs += dt * 1000;
    this.boardAcc += dt;
    if (this.boardAcc >= 60) {
      this.boardAcc = 0;
      this.pushLiveScore();
    }
  }

  flushClock() {
    if (this.state && Number.isFinite(this.state.runMs) && this.screen !== 'menu') save(this.state);
  }

  start() {
    this.showMenu();
  }

  showMenu(view = 'home') {
    this.flushClock();
    this.screen = 'menu';
    this.station?.destroy();
    this.station = null;
    this.app.hud.innerHTML = '';
    this.backdrop.showShip = true;
    this.app.setView(this.backdrop);
    const slots = listSlots();
    const showWhatsNew = view === 'home' && shouldShowWhatsNew(VERSION);
    renderMenu(this.app.ui, {
      slots,
      view,
      showWhatsNew,
      onContinue: () => this.showMenu('continue'),
      onPickSave: (index) => this.continueGame(index),
      onDeleteSave: async (index) => {
        await abandonRun(peekSlot(index));
        clearSave(index);
        const cur = load();
        if (!this.state || !cur || cur.runId !== this.state.runId) this.state = null;
        this.showMenu(occupiedSlots().length ? 'continue' : 'home');
      },
      onNew: () => {
        this.replaceSlot = null;
        if (freeSlotIndex() < 0) this.showMenu('replace');
        else this.showMenu('new');
      },
      onReplace: (index) => {
        this.replaceSlot = index;
        this.showMenu('new');
      },
      onStart: (name) => this.newGame(name, this.replaceSlot),
      onBack: () => this.showMenu('home'),
      onLeaderboard: () => this.showLeaderboard(),
      onSettings: (panel) => this.showSettings(panel),
    });
    if (view !== 'new') this.replaceSlot = null;
  }

  showLeaderboard() {
    this.screen = 'menu';
    this.backdrop.showShip = true;
    this.app.setView(this.backdrop);
    renderLeaderboard(this.app.ui, { onBack: () => this.showMenu() });
  }

  showSettings(panel = 'hub') {
    this.screen = 'menu';
    this.backdrop.showShip = true;
    this.app.setView(this.backdrop);
    renderSettings(this.app.ui, {
      audio: this.app.audio,
      party: this.app.party,
      initialPanel: panel || 'hub',
      onBack: () => this.showMenu(),
      onSaveCleared: () => {
        const cur = load();
        if (!this.state || !cur || cur.runId !== this.state.runId) this.state = null;
      },
      onQrLock: (on) => this.app.party?.setQrVisible(on, true),
    });
  }

  setGalaxy(seed) {
    this.galaxy = generateGalaxy(seed);
    this.starmap = new StarMapView(this.galaxy, this.app.pixelRatio);
  }

  async newGame(name, replaceIndex) {
    this.app.audio.play('click');
    const taken = occupiedSlots()
      .filter((s) => s.index !== replaceIndex)
      .map((s) => s.callsign);
    const callsign = uniqueCallsign(name, taken);
    const slot = Number.isInteger(replaceIndex) ? replaceIndex : freeSlotIndex();
    if (slot < 0) return this.showMenu('replace');
    const prev = peekSlot(slot);
    if (hasRunClock(prev)) await abandonRun(prev);
    this.setGalaxy(Math.floor(Math.random() * 2 ** 31));
    this.state = newState(this.galaxy);
    this.state.callsign = callsign;
    generateContracts(this.state, this.galaxy);
    writeActive(this.state, slot);
    saveCallsign(callsign);
    this.replaceSlot = null;
    this.showStation({
      kind: 'info',
      title: 'Welcome, Trader',
      lines: [['Callsign', callsign], ['Starting credits', `${this.state.credits} cr`]],
      note: 'Haul cargo along the lanes of difficulty 1 to earn credits, then upgrade your ship to take on harder routes. The Terminus waits at the far edge of the map.',
    });
  }

  continueGame(index) {
    this.app.audio.play('click');
    const s = load(index);
    if (!s) return this.showMenu();
    if (this.galaxy?.seed !== s.seed) this.setGalaxy(s.seed);
    this.state = s;
    if (s.callsign) saveCallsign(s.callsign);
    if (!s.contracts?.length) generateContracts(s, this.galaxy);
    this.showStation();
  }

  startDemo() {
    if (!this.state) {
      this.setGalaxy(Math.floor(Math.random() * 2 ** 31));
      this.state = newState(this.galaxy);
      generateContracts(this.state, this.galaxy);
    }
    const s = this.state;
    for (const [key, def] of Object.entries(SYSTEMS)) s.upgrades[key] = def.max;
    s.weapons = [...WEAPON_ORDER];
    if (!s.weapons.includes(s.weapon)) s.weapon = 'pulse';
    s.hull = shipStats(s).maxHull;
    s.cheated = true;
    save(s);
    this.app.cheats.god = true;
    if (this.travel) {
      this.travel.beginInfinite(s);
      return;
    }
    this.station?.destroy();
    this.station = null;
    if (this.dock) {
      this.dock.dispose();
      this.dock = null;
    }
    this.app.ui.innerHTML = '';
    this.app.hud.innerHTML = '';
    const here = this.galaxy.systems[s.current];
    const destId = here.links.find((id) => !this.galaxy.systems[id].terminus) ?? here.links[0];
    const contract = {
      dest: destId,
      difficulty: 1,
      good: 'Demo Cargo',
      pay: 1,
      dist: 0,
      waves: 1,
      forceBoss: false,
      infinite: true,
    };
    this.flight = { contract, from: here, to: this.galaxy.systems[destId], hull: s.hull, skipDock: true };
    this.startTravel();
  }

  showStation(report) {
    this.screen = 'station';
    this.station?.destroy();
    this.app.hud.innerHTML = '';
    this.station = new StationScreen(this, { report });
    this.pushLiveScore();
  }

  // A flight is three scenes: undock at the origin, the travel waves, then dock at
  // the destination. Hull damage carries through all three.
  launch(contract) {
    const s = this.state;
    this.station.destroy();
    this.station = null;
    this.app.ui.innerHTML = '';
    const from = this.galaxy.systems[s.current];
    const to = this.galaxy.systems[contract.dest];
    this.flight = { contract, from, to, hull: s.hull };
    this.screen = 'dock';
    this.startDock('undock', from, () => this.startTravel());
  }

  startDock(mode, system, next) {
    this.screen = 'dock';
    this.dock = new DockView(this.app, {
      mode, system, galaxy: this.galaxy, state: this.state, hull: this.flight.hull,
      // Deferred so we don't tear down the view in the middle of its own update.
      onDone: (r) => setTimeout(() => {
        this.dock.dispose();
        this.dock = null;
        this.flight.hull = r.hull;
        next(r);
      }, 0),
    });
    this.app.setView(this.dock);
  }

  startTravel() {
    this.screen = 'travel';
    const { contract, from, to } = this.flight;
    this.travel = new TravelView(this.app, {
      state: this.state,
      from: from.name,
      to: to.name,
      contract,
      hull: this.flight.hull,
      isFinal: !!to.terminus,
      onDone: (r) => setTimeout(() => {
        this.travel.dispose();
        this.travel = null;
        if (!r.success || this.flight.skipDock) return this.applyTravelResult(contract, r);
        this.flight.hull = r.hull;
        this.screen = 'dock';
        this.startDock('dock', to, (d) => this.applyTravelResult(contract, { ...r, hull: d.hull, dockBumps: d.bumps }));
      }, 0),
    });
    this.app.setView(this.travel);
  }

  applyTravelResult(contract, r) {
    this.flight = null;
    const s = this.state;
    const origin = this.galaxy.systems[s.current];
    const dest = this.galaxy.systems[contract.dest];
    const stats = shipStats(s);
    s.weapon = r.weapon;
    s.stats.flights++;
    s.stats.kills += r.kills;
    recordFlight(s, r);
    let report;

    if (r.success) {
      const cargoPay = contract.pay * stats.cargo;
      const clean = r.dockBumps === 0;
      const dockBonus = clean ? Math.round(cargoPay * PRECISION_BONUS) : 0;
      const total = cargoPay + r.bounty + dockBonus;
      s.credits += total;
      s.hull = Math.max(1, Math.round(r.hull));
      s.current = dest.id;
      const firstVisit = !s.visited.includes(dest.id);
      if (firstVisit) s.visited.push(dest.id);
      s.stats.deliveries++;
      s.stats.earned += total;
      if (r.bossKilled) s.stats.bosses++;
      report = {
        kind: 'success',
        title: `Delivered to ${dest.name}`,
        lines: [
          [`${contract.good} ×${stats.cargo} @ ${contract.pay} cr`, `+${fmt(cargoPay)} cr`, 'accent'],
          [`Bounties (${r.kills} kills${r.bossKilled ? ', capital ship' : ''})`, `+${fmt(r.bounty)} cr`, 'accent'],
          clean
            ? ['Precision docking bonus', `+${fmt(dockBonus)} cr`, 'accent']
            : r.dockBumps == null
            ? null // test flight that skipped docking
            : [`Docking (${r.dockBumps} bump${r.dockBumps === 1 ? '' : 's'})`, 'No bonus', 'warn'],
          ['Total', `+${fmt(total)} cr`, 'accent big'],
          ['Hull', `${fmt(s.hull)} / ${fmt(stats.maxHull)}`],
        ].filter(Boolean),
        note: firstVisit ? `First visit to ${dest.name}. New lanes charted.` : '',
      };
      if (dest.terminus && !s.won) {
        s.won = true;
        const unlocks = checkAchievements(s, r);
        generateContracts(s, this.galaxy);
        save(s);
        this.showVictory(unlocks);
        return;
      }
    } else if (r.retreat) {
      s.hull = Math.max(1, Math.round(r.hull));
      report = {
        kind: 'warn',
        title: `Retreated to ${origin.name}`,
        lines: [['Contract', 'Forfeited', 'warn'], ['Hull', `${fmt(s.hull)} / ${fmt(stats.maxHull)}`]],
      };
    } else {
      const fee = towFee(s, contract.difficulty);
      s.credits -= fee;
      s.hull = stats.maxHull;
      s.stats.deaths++;
      report = {
        kind: 'danger',
        title: 'Ship destroyed',
        lines: [
          ['Cargo', 'Lost', 'warn'],
          ['Bounties', 'Lost', 'warn'],
          ['Tow & rebuild fee', `-${fmt(fee)} cr`, 'warn'],
          ['Hull', 'Rebuilt to full'],
        ],
        note: `Your wreck was towed back to ${origin.name}.`,
      };
    }
    const unlocks = checkAchievements(s, r);
    if (unlocks.length) {
      report.unlocks = unlocks;
      const extra = unlocks.map((u) => `${u.name} — ${u.reward}`).join(' ');
      report.note = report.note ? `${report.note} ${extra}` : extra;
    }
    generateContracts(s, this.galaxy);
    save(s);
    this.showStation(report);
  }

  showVictory(unlocks = []) {
    const s = this.state;
    this.screen = 'victory';
    this.app.audio.play('victory');
    this.backdrop.showShip = true;
    this.app.setView(this.backdrop);
    const score = runScore(s.stats);
    const timed = hasRunClock(s);
    const timeLabel = timed ? formatRunTime(s.runMs) : '—';
    const priorName = s.callsign || ensureCallsign();
    this.app.ui.innerHTML = `
      <div class="menu victory">
        <h1 class="logo">TERMINUS<span>REACHED</span></h1>
        <p class="tagline">You carried the Founders' Beacon to the edge of known space. The lanes will remember your name.</p>
        <div class="panel stats-panel">
          <div class="r-line"><span>Deliveries</span><b>${s.stats.deliveries}</b></div>
          <div class="r-line"><span>Credits earned</span><b>${fmt(s.stats.earned)} cr</b></div>
          <div class="r-line"><span>Hostiles destroyed</span><b>${fmt(s.stats.kills)}</b></div>
          <div class="r-line"><span>Capital ships destroyed</span><b>${s.stats.bosses}</b></div>
          <div class="r-line"><span>Ships lost</span><b>${s.stats.deaths}</b></div>
          <div class="r-line"><span>Systems visited</span><b>${s.visited.length} / ${this.galaxy.systems.length}</b></div>
          <div class="r-line"><span>Run time</span><b>${timeLabel}</b></div>
          <div class="r-line"><span>Pace matching</span><b>${s.paced !== false ? 'On' : 'Off'}</b></div>
          <div class="r-line"><span>Credits</span><b class="accent">+${fmt(score.earned)}</b></div>
          <div class="r-line"><span>Kills × 50</span><b class="accent">+${fmt(score.killPts)}</b></div>
          <div class="r-line"><span>Capital ships × 2,500</span><b class="accent">+${fmt(score.bossPts)}</b></div>
          <div class="r-line"><span>Ships lost × ${fmt(SCORE.death)}</span><b class="warn">−${fmt(score.deathPts)}</b></div>
          <div class="r-line"><span>Score</span><b class="big">${fmt(score.total)}</b></div>
          ${unlocks.length ? unlocks.map((u) => `<div class="r-line"><span>${u.name}</span><b class="accent">${u.reward}</b></div>`).join('') : ''}
          ${
            s.cheated
              ? '<p class="muted small">Test run: the dev console was used, so it cannot be posted.</p>'
              : timed
              ? `<div class="submit-row">
                  <input type="text" maxlength="16" spellcheck="false" placeholder="Callsign" value="${escapeAttr(priorName)}" data-callsign>
                  <button class="btn primary" data-act="submit">Submit</button>
                </div>
                <p class="submit-status muted small"></p>`
              : '<p class="muted small">This save started before the leaderboard clock, so it cannot be posted.</p>'
          }
        </div>
        <div class="menu-buttons">
          <button class="btn primary big" data-act="keep">Keep flying</button>
          <button class="btn big" data-act="menu">Main menu</button>
        </div>
      </div>`;
    const root = this.app.ui.querySelector('.victory');
    const status = root.querySelector('.submit-status');
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'keep') this.showStation();
      if (act === 'menu') this.showMenu();
      if (act === 'submit') this.submitVictory(root, status, score);
    });
  }

  async submitVictory(root, status, score) {
    const s = this.state;
    const input = root.querySelector('[data-callsign]');
    const btn = root.querySelector('[data-act="submit"]');
    const callsign = (input?.value || '').trim();
    if (s.cheated) return;
    if (!CALLSIGN_RE.test(callsign)) {
      status.textContent = 'Callsign must be 2–16 letters, numbers, spaces, or hyphens.';
      status.className = 'submit-status warn small';
      return;
    }
    if (s.runMs < MIN_TIME_MS) {
      status.textContent = 'Runs under 3 minutes are not posted.';
      status.className = 'submit-status warn small';
      return;
    }
    btn.disabled = true;
    status.textContent = 'Posting to the lanes…';
    status.className = 'submit-status muted small';
    try {
      saveCallsign(callsign);
      const data = await submitRun({
        run_id: s.runId,
        callsign,
        score: score.total,
        time_ms: Math.round(s.runMs),
        earned: s.stats.earned,
        kills: s.stats.kills,
        bosses: s.stats.bosses,
        deaths: s.stats.deaths,
        deliveries: s.stats.deliveries,
        seed: s.seed,
        status: 'done',
        paced: s.paced !== false,
      });
      status.innerHTML = `Posted. Score rank <b class="accent">#${data.rank_score}</b> · Time rank <b class="accent">#${data.rank_time}</b>`;
      status.className = 'submit-status small';
    } catch (err) {
      btn.disabled = false;
      status.textContent =
        err.message && err.message !== 'offline'
          ? err.message
          : 'The board is offline. Host the PHP API on this domain to post scores.';
      status.className = 'submit-status warn small';
    }
  }

  pushLiveScore() {
    const s = this.state;
    if (!hasRunClock(s) || s.won || s.cheated) return;
    const callsign = (s.callsign || loadCallsign() || ensureCallsign()).trim();
    if (!CALLSIGN_RE.test(callsign)) return;
    const score = runScore(s.stats);
    submitRun({
      run_id: s.runId,
      callsign,
      score: score.total,
      time_ms: Math.round(s.runMs),
      earned: s.stats.earned,
      kills: s.stats.kills,
      bosses: s.stats.bosses,
      deaths: s.stats.deaths,
      deliveries: s.stats.deliveries,
      seed: s.seed,
      status: 'live',
      paced: s.paced !== false,
    }).catch(() => {});
  }
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
