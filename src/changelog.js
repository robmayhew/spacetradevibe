export const VERSION = '0.3.2';

export const CHANGELOG = [
  {
    version: '0.3.2',
    notes: [
      'Home screen shrinks on short windows so buttons and How to play stay on screen',
      'Escort QR and room code live in Settings',
      'Dice button rolls a random callsign',
    ],
  },
  {
    version: '0.3.1',
    notes: [
      'Starting a new game or deleting a save drops that run\'s open Lane Records row',
      'Escort chip stays off the Ship Systems cards',
      'Ship-lost score penalty is 1,000 instead of 10,000',
      'Undocking names the nose-up heading toward the departure gate',
    ],
  },
  {
    version: '0.3.0',
    notes: [
      'Achievement hulls in the station hangar, kept on this device',
      'Flak, Rail Lance, Swarm Darts, and Nova Ring',
      'Pace matching that eases or tightens combat from recent flights, with a Display toggle',
      'Escort QR Keep on / Keep off on the main menu and in Display settings',
    ],
  },
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
    url: 'mailto:rob.mayhew@gmail.com',
  },
  {
    role: 'Contributor',
    name: 'Jacky Tai',
    url: 'https://www.linkedin.com/in/jackytai/',
    extra: [{ label: 'email', url: 'mailto:dev@itrealsimple.com' }],
  },
];

export function creditsHtml() {
  return CREDITS.map((c) => {
    const extra = (c.extra || [])
      .map((e) => ` <span class="credit-sep">·</span> ${creditLink(e.url, e.label)}`)
      .join('');
    return `${escapeHtml(c.role)} ${creditLink(c.url, c.name)}${extra}`;
  }).join(' <span class="credit-sep">·</span> ');
}

function creditLink(url, label) {
  const blank = /^https?:/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a class="credit-link" href="${escapeAttr(url)}"${blank}>${escapeHtml(label)}</a>`;
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
