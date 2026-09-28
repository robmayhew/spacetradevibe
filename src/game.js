import { generateGalaxy } from './galaxy.js';
import { newState, generateContracts, shipStats, towFee, save, load } from './state.js';
import { BackdropView } from './views/backdrop.js';
import { StarMapView } from './views/starmap.js';
import { TravelView } from './views/travel.js';
import { renderMenu } from './ui/menu.js';
import { StationScreen } from './ui/station.js';

const fmt = (n) => Math.round(n).toLocaleString();

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
  }

  start() {
    this.showMenu();
  }

  showMenu() {
    this.station?.destroy();
    this.station = null;
    this.app.hud.innerHTML = '';
    this.backdrop.showShip = true;
    this.app.setView(this.backdrop);
    renderMenu(this.app.ui, {
      hasSave: !!load(),
      muted: this.app.audio.muted,
      onNew: () => this.newGame(),
      onContinue: () => this.continueGame(),
      onToggleMute: () => this.app.audio.toggleMute(),
    });
  }

  setGalaxy(seed) {
    this.galaxy = generateGalaxy(seed);
    this.starmap = new StarMapView(this.galaxy, this.app.pixelRatio);
  }

  newGame() {
    this.app.audio.play('click');
    this.setGalaxy(Math.floor(Math.random() * 2 ** 31));
    this.state = newState(this.galaxy);
    generateContracts(this.state, this.galaxy);
    save(this.state);
    this.showStation({
      kind: 'info',
      title: 'Welcome, Trader',
      lines: [['Starting credits', `${this.state.credits} cr`]],
      note: 'Haul cargo along the lanes of difficulty 1 to earn credits, then upgrade your ship to take on harder routes. The Terminus waits at the far edge of the map.',
    });
  }

  continueGame() {
    this.app.audio.play('click');
    const s = load();
    if (!s) return this.showMenu();
    if (this.galaxy?.seed !== s.seed) this.setGalaxy(s.seed);
    this.state = s;
    if (!s.contracts?.length) generateContracts(s, this.galaxy);
    this.showStation();
  }

  showStation(report) {
    this.station?.destroy();
    this.app.hud.innerHTML = '';
    this.station = new StationScreen(this, { report });
  }

  launch(contract) {
    const s = this.state;
    this.station.destroy();
    this.station = null;
    this.app.ui.innerHTML = '';
    const from = this.galaxy.systems[s.current];
    const to = this.galaxy.systems[contract.dest];
    this.travel = new TravelView(this.app, {
      state: s,
      from: from.name,
      to: to.name,
      contract,
      isFinal: !!to.terminus,
      onDone: (r) => this.finishTravel(contract, r),
    });
    this.app.setView(this.travel);
  }

  finishTravel(contract, r) {
    // Defer so we don't tear down the travel view in the middle of its own update.
    setTimeout(() => this.applyTravelResult(contract, r), 0);
  }

  applyTravelResult(contract, r) {
    this.travel.dispose();
    this.travel = null;
    const s = this.state;
    const origin = this.galaxy.systems[s.current];
    const dest = this.galaxy.systems[contract.dest];
    const stats = shipStats(s);
    s.weapon = r.weapon;
    s.stats.flights++;
    s.stats.kills += r.kills;
    let report;

    if (r.success) {
      const cargoPay = contract.pay * stats.cargo;
      const total = cargoPay + r.bounty;
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
          ['Total', `+${fmt(total)} cr`, 'accent big'],
          ['Hull', `${fmt(s.hull)} / ${fmt(stats.maxHull)}`],
        ],
        note: firstVisit ? `First visit to ${dest.name}. New lanes charted.` : '',
      };
      if (dest.terminus && !s.won) {
        s.won = true;
        generateContracts(s, this.galaxy);
        save(s);
        this.showVictory();
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
    generateContracts(s, this.galaxy);
    save(s);
    this.showStation(report);
  }

  showVictory() {
    const s = this.state;
    this.app.audio.play('victory');
    this.backdrop.showShip = true;
    this.app.setView(this.backdrop);
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
        </div>
        <div class="menu-buttons">
          <button class="btn primary big" data-act="keep">Keep flying</button>
          <button class="btn big" data-act="menu">Main menu</button>
        </div>
      </div>`;
    this.app.ui.querySelector('.victory').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'keep') this.showStation();
      if (act === 'menu') this.showMenu();
    });
  }
}
