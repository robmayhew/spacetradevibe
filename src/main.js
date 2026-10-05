import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';
import { PadNav } from './ui/padnav.js';
import { PartyHost } from './party/host.js';
import { applyMobileLayout, pixelRatioCap, registerServiceWorker, startMobileLayout } from './mobile.js';
import { TouchPad } from './ui/touchpad.js';

class App {
  constructor() {
    startMobileLayout();
    this.container = document.getElementById('app');
    this.ui = document.getElementById('ui');
    this.hud = document.getElementById('hud');
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap());

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.container.prepend(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.pixelRatio);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.4, 0.72);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.input = new Input();
    this.pad = new TouchPad(document.getElementById('touch-pad'), this.input);
    this.padNav = new PadNav(this);
    this.audio = new Sfx();
    this.view = null;
    this.timeScale = 1; // dev console `speed`
    this.cheats = { god: false };
    this.party = new PartyHost(document.getElementById('party'));
    this.party.start();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => this.view?.setPaused?.(true));
    this.resize();

    this.game = new Game(this);
    this.game.start();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  setView(view) {
    if (this.view === view) return;
    this.view = view;
    this.renderPass.scene = view.scene;
    this.renderPass.camera = view.camera;
    view.resize(this.w, this.h);
  }

  resize() {
    applyMobileLayout();
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, pixelRatioCap());
    if (pr !== this.pixelRatio) {
      // e.g. window dragged to a display with a different pixel density
      this.pixelRatio = pr;
      this.renderer.setPixelRatio(pr);
      this.composer.setPixelRatio(pr);
    }
    this.renderer.setSize(this.w, this.h);
    this.composer.setSize(this.w, this.h);
    this.view?.resize(this.w, this.h);
    if (document.body.classList.contains('portrait-gate')) this.view?.setPaused?.(true);
  }

  frame = (now) => {
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); // never step backwards
    this.last = now;
    this.input.poll(); // gamepad
    this.padNav.update(dt); // gamepad menu navigation (before sub-steps clear presses)
    // Fast-forward runs several sub-steps so collisions don't tunnel; key presses only
    // count in the first one so toggles (pause, weapon switch) don't fire repeatedly.
    const steps = Math.max(1, Math.ceil(this.timeScale));
    const step = (dt * this.timeScale) / steps;
    for (let i = 0; i < steps; i++) {
      this.view?.update(step);
      this.game.tick(step);
      if (i === 0 && steps > 1) this.input.endFrame();
    }
    this.party?.tick(dt);
    this.composer.render(dt);
    this.input.endFrame();
    requestAnimationFrame(this.frame);
  };
}

const app = new App();
registerServiceWorker();
if (import.meta.env.DEV) window.__txl = app; // debugging handle in dev builds only
// Test console: always in dev; on a deployed build only with ?console in the URL.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('console')) {
  import('./dev/console.js').then(({ DevConsole }) => new DevConsole(app));
}
