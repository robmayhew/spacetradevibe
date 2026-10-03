const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();
    window.addEventListener('keydown', (e) => {
      // Typing in a text field (dev console, callsign) must not fly the ship.
      if (e.target.closest?.('input, textarea, [contenteditable]')) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
      if (GAME_KEYS.has(e.code) && this.captureKeys) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    this.captureKeys = false;
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
