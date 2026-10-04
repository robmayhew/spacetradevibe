const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const DEADZONE = 0.25;

// Button indexes in Chrome's "standard" gamepad layout (Xbox-style; F310 in most setups).
const STANDARD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, LS: 10, RS: 11, Up: 12, Down: 13, Left: 14, Right: 15 };
// Raw DirectInput layout (Logitech "Dual Action" / F310 in D mode) for when Chrome doesn't remap it.
const DUAL_ACTION = { X: 0, A: 1, B: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, LS: 10, RS: 11 };

// Gamepad buttons that act like keyboard keys during play.
const PAD_TO_KEYS = {
  held: { A: 'Space', RT: 'Space' },
  pressed: { X: 'KeyF', LB: 'KeyQ', RB: 'KeyE', Start: 'Escape' },
};

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();
    this.pad = { connected: false, id: '', mapping: '', stick: { x: 0, y: 0 }, held: new Set(), pressed: new Set(), axes: [] };
    this.padKeysHeld = new Set();
    this.padKeysPressed = new Set();
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
    return codes.some((c) => this.held.has(c) || this.padKeysHeld.has(c));
  }

  hit(...codes) {
    return codes.some((c) => this.pressed.has(c) || this.padKeysPressed.has(c));
  }

  // Movement as a vector: keyboard / D-pad give full speed, the stick gives analog speed.
  // y is up-positive. Length is at most 1.
  move() {
    let x = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let y = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
    if (!x && !y) ({ x, y } = this.pad.stick);
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  // Read the first connected gamepad. Chrome only exposes a pad after a button press.
  poll() {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = [...pads].find((p) => p && p.connected);
    const pad = this.pad;
    const prev = pad.held;
    pad.held = new Set();
    pad.connected = !!gp;
    if (gp) {
      pad.id = gp.id;
      pad.mapping = gp.mapping;
      pad.axes = [...gp.axes];
      const layout = gp.mapping === 'standard' ? STANDARD : DUAL_ACTION;
      for (const [name, i] of Object.entries(layout)) {
        const b = gp.buttons[i];
        if (b && (b.pressed || b.value > 0.5)) pad.held.add(name);
      }
      // Non-standard pads often report the D-pad as a hat on the last axis.
      if (gp.mapping !== 'standard' && gp.axes.length >= 10) {
        const hat = gp.axes[9];
        if (hat >= -1.05 && hat <= 1.05) {
          const dir = Math.round((hat + 1) / (2 / 7)); // 0=up, clockwise in eighths
          if ([7, 0, 1].includes(dir)) pad.held.add('Up');
          if ([1, 2, 3].includes(dir)) pad.held.add('Right');
          if ([3, 4, 5].includes(dir)) pad.held.add('Down');
          if ([5, 6, 7].includes(dir)) pad.held.add('Left');
        }
      }
      let sx = gp.axes[0] ?? 0;
      let sy = -(gp.axes[1] ?? 0);
      const mag = Math.hypot(sx, sy);
      if (mag < DEADZONE) sx = sy = 0;
      else {
        const k = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE)) / mag; // rescale past the deadzone
        sx *= k;
        sy *= k;
      }
      // D-pad overrides the stick with full-speed digital movement.
      const dx = (pad.held.has('Right') ? 1 : 0) - (pad.held.has('Left') ? 1 : 0);
      const dy = (pad.held.has('Up') ? 1 : 0) - (pad.held.has('Down') ? 1 : 0);
      pad.stick = dx || dy ? { x: dx, y: dy } : { x: sx, y: sy };
    } else {
      pad.stick = { x: 0, y: 0 };
    }
    for (const name of pad.held) if (!prev.has(name)) pad.pressed.add(name);

    this.padKeysHeld = new Set(Object.entries(PAD_TO_KEYS.held).filter(([b]) => pad.held.has(b)).map(([, k]) => k));
    for (const [b, k] of Object.entries(PAD_TO_KEYS.pressed)) if (pad.pressed.has(b)) this.padKeysPressed.add(k);
  }

  endFrame() {
    this.pressed.clear();
    this.pad.pressed.clear();
    this.padKeysPressed.clear();
  }
}
