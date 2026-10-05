export class TouchPad {
  constructor(root, input) {
    this.root = root;
    this.input = input;
    this.stickId = null;
    this.stick = root.querySelector('.touch-stick');
    this.knob = root.querySelector('.touch-knob');
    this.bind();
  }

  bind() {
    const stick = this.stick;
    const move = (x, y) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = (x - cx) / (r.width / 2);
      let dy = (y - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      const nx = Math.abs(dx) < 0.12 ? 0 : dx;
      const ny = Math.abs(dy) < 0.12 ? 0 : -dy;
      this.input.setStick(nx, ny);
      this.knob.style.transform = `translate(${dx * 34}%, ${dy * 34}%)`;
    };
    const endStick = () => {
      this.stickId = null;
      this.input.setStick(0, 0);
      this.knob.style.transform = '';
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      move(e.clientX, e.clientY);
    });
    stick.addEventListener('pointermove', (e) => {
      if (this.stickId !== e.pointerId) return;
      move(e.clientX, e.clientY);
    });
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    this.root.querySelectorAll('[data-hold]').forEach((btn) => {
      const code = btn.dataset.hold;
      const on = (e) => {
        e.preventDefault();
        btn.classList.add('hot');
        this.input.hold(code);
      };
      const off = () => {
        btn.classList.remove('hot');
        this.input.release(code);
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    });

    this.root.querySelectorAll('[data-tap]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.input.tap(btn.dataset.tap);
        btn.classList.add('hot');
      });
      const cool = () => btn.classList.remove('hot');
      btn.addEventListener('pointerup', cool);
      btn.addEventListener('pointercancel', cool);
      btn.addEventListener('pointerleave', cool);
    });
    this.root.querySelectorAll('[data-toggle="weapons"]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('txl-toggle-weapons'));
      });
    });
    this.root.querySelectorAll('[data-hold], [data-tap], [data-toggle], .touch-stick').forEach((el) => {
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }
}
