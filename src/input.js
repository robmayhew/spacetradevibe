const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();
    this.stickX = 0;
    this.stickY = 0;
    window.addEventListener('keydown', (e) => {
      // Typing in a text field (dev console, callsign) must not fly the ship.
      if (e.target.closest?.('input, textarea, [contenteditable]')) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
      if (GAME_KEYS.has(e.code) && this.captureKeys) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.setStick(0, 0);
    });
    this.captureKeys = false;
  }

  hold(code) {
    this.held.add(code);
  }

  release(code) {
    this.held.delete(code);
  }

  tap(code) {
    this.pressed.add(code);
  }

  setStick(x, y) {
    this.stickX = x;
    this.stickY = y;
  }

  // Keyboard is full deflection; the stick can be slower when it is not pushed all the way.
  move() {
    const kx = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    const ky = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
    if (kx || ky) {
      const len = Math.hypot(kx, ky) || 1;
      return { x: kx / len, y: ky / len };
    }
    const sl = Math.hypot(this.stickX, this.stickY);
    if (sl > 1) return { x: this.stickX / sl, y: this.stickY / sl };
    return { x: this.stickX, y: this.stickY };
  }

  down(...codes) {
    return codes.some((c) => this.held.has(c));
  }

  hit(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  endFrame() {
    this.pressed.clear();
  }
}
