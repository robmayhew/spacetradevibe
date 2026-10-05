const SHORT_SIDE = 540;

export function isPhoneLayout() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const short = Math.min(window.innerWidth, window.innerHeight) <= SHORT_SIDE;
  return coarse && short;
}

export function isLandscape() {
  return window.innerWidth > window.innerHeight;
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone;
}

export function pixelRatioCap() {
  return document.body.classList.contains('mobile') ? 1.5 : 2;
}

export function setPlayPad(on) {
  document.body.classList.toggle('play-pad', !!on);
}

function lockLandscape() {
  if (!isStandalone()) return;
  screen.orientation?.lock?.('landscape').catch(() => {});
}

export function applyMobileLayout() {
  const mobile = isPhoneLayout();
  const landscape = isLandscape();
  document.body.classList.toggle('mobile', mobile);
  document.body.classList.toggle('portrait-gate', mobile && !landscape);
  if (mobile && landscape) lockLandscape();
}

export function startMobileLayout() {
  applyMobileLayout();
  window.addEventListener('resize', applyMobileLayout);
  window.addEventListener('orientationchange', applyMobileLayout);
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

export function escortInviteHtml(party, extraClass = '') {
  const room = party?.room;
  if (!room) return '';
  return `<div class="escort-invite ${extraClass}">
    <span class="eyebrow">Escorts</span>
    <b class="invite-code">${room}</b>
    <button type="button" class="btn small" data-act="copy-room">Copy code</button>
  </div>`;
}

export async function copyRoomCode(party, btn) {
  const room = party?.room;
  if (!room) return;
  try {
    await navigator.clipboard.writeText(room);
  } catch {
    const field = document.createElement('textarea');
    field.value = room;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.left = '-9999px';
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand('copy');
    } catch {
      /* ignore */
    }
    field.remove();
  }
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = 'Copied';
  window.setTimeout(() => {
    if (btn.isConnected) btn.textContent = prev;
  }, 1400);
}
