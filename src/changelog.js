export const VERSION = '0.2.0';

export const CHANGELOG = [
  {
    version: '0.2.0',
    notes: [
      'Settings menu with audio, display, and save controls',
      'Volume slider and screen-shake toggle',
      'Fullscreen and delete-save options',
      'Version history and a one-time What\'s New note',
      'Creator credits on the main menu and in About',
      'Private bug reports and a public feature-request board',
    ],
  },
  {
    version: '0.1.0',
    notes: [
      'Contracts, upgrades, combat, and docking',
      'Galaxy map with a Terminus win condition',
      'Lane Records leaderboard with live and finished runs',
      'Escort party play over QR or room code',
      'Callsign for the board while you fly and when you arrive',
    ],
  },
];

export const CREDITS = [
  {
    role: 'Founded by',
    name: 'Rob Mayhew',
    url: 'https://www.linkedin.com/in/robmayhew/',
  },
  {
    role: 'Contributor',
    name: 'Jacky Tai',
    url: 'https://www.linkedin.com/in/jackytai/',
  },
];

export function creditsHtml() {
  return CREDITS.map(
    (c) =>
      `${escapeHtml(c.role)} <a class="credit-link" href="${escapeAttr(c.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.name)}</a>`,
  ).join(' <span class="credit-sep">·</span> ');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
