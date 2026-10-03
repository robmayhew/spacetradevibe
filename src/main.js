import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';
import { PartyHost } from './party/host.js';

class App {
  constructor() {
    this.container = document.getElementById('app');
    this.ui = document.getElementById('ui');
    this.hud = document.getElementById('hud');
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

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
    this.audio = new Sfx();
    this.view = null;
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
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    if (pr !== this.pixelRatio) {
      // e.g. window dragged to a display with a different pixel density
      this.pixelRatio = pr;
      this.renderer.setPixelRatio(pr);
      this.composer.setPixelRatio(pr);
    }
    this.renderer.setSize(this.w, this.h);
    this.composer.setSize(this.w, this.h);
    this.view?.resize(this.w, this.h);
  }

  frame = (now) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.view?.update(dt);
    this.game.tick(dt);
    this.party?.tick(dt);
    this.composer.render(dt);
    this.input.endFrame();
    requestAnimationFrame(this.frame);
  };
}

const app = new App();
if (import.meta.env.DEV) window.__txl = app; // debugging handle in dev builds only
