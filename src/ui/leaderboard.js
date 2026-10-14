import { fetchBoard, formatRunTime, BOARD_SEASON_LABEL } from '../score.js';

const fmt = (n) => Math.round(n).toLocaleString();

function formatBoardPace(row) {
  if (row.paced === false) return 'Off';
  const n = Number(row.pace);
  const p = Number.isFinite(n) ? n / 100 : 1;
  return `×${p.toFixed(2)}`;
}

function statusLabel(status) {
  if (status === 'live') return { cls: 'board-live', text: 'In flight' };
  if (status === 'lost') return { cls: 'board-lost', text: 'Lost' };
  return { cls: 'board-done', text: 'Arrived' };
}

function dash(n, showZero = false) {
  if (n == null || n === '') return '—';
  if (!showZero && !n) return '—';
  return fmt(n);
}

function rowMeta(r) {
  const st = statusLabel(r.status);
  return `${escapeHtml(r.callsign)} <span class="${st.cls}">${st.text}</span>${r.paced === false ? ' <span class="board-pace">Unpaced</span>' : ''}`;
}

function renderTable(rows) {
  return `<table class="board">
    <thead><tr>
      <th>#</th><th>Callsign</th><th>Score</th><th>Deliveries</th><th>Earned</th><th>Cash</th>
      <th>System</th><th>Rating</th><th>Visited</th><th>Deepest</th><th>Kills</th><th>Lost</th><th>Pace</th><th>Time</th>
    </tr></thead>
    <tbody>${rows
      .map(
        (r, i) => `<tr>
          <td>${r.rank ?? i + 1}</td>
          <td>${rowMeta(r)}</td>
          <td>${fmt(r.score)}</td>
          <td>${dash(r.deliveries, true)}</td>
          <td>${dash(r.earned, true)}</td>
          <td>${fmt(r.credits || 0)}</td>
          <td class="board-sys">${r.system ? escapeHtml(r.system) : '—'}</td>
          <td>${r.rating ? fmt(r.rating) : '—'}</td>
          <td>${r.visited ? fmt(r.visited) : '—'}</td>
          <td>${r.deepest ? fmt(r.deepest) : '—'}</td>
          <td>${dash(r.kills, true)}</td>
          <td>${dash(r.deaths, true)}</td>
          <td>${formatBoardPace(r)}</td>
          <td>${formatRunTime(r.time_ms)}</td>
        </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

function renderCards(rows) {
  return `<div class="board-cards">${rows
    .map((r, i) => {
      const st = statusLabel(r.status);
      return `<article class="board-card panel">
        <div class="board-card-head">
          <b>#${r.rank ?? i + 1}</b>
          <span>${escapeHtml(r.callsign)}</span>
          <span class="${st.cls}">${st.text}</span>
          ${r.paced === false ? '<span class="board-pace">Unpaced</span>' : ''}
        </div>
        <div class="board-card-grid">
          <div><label>Score</label><b>${fmt(r.score)}</b></div>
          <div><label>Deliveries</label><b>${dash(r.deliveries, true)}</b></div>
          <div><label>Earned</label><b>${dash(r.earned, true)}</b></div>
          <div><label>Cash</label><b>${fmt(r.credits || 0)}</b></div>
          <div><label>System</label><b>${r.system ? escapeHtml(r.system) : '—'}</b></div>
          <div><label>Rating</label><b>${r.rating ? fmt(r.rating) : '—'}</b></div>
          <div><label>Visited</label><b>${r.visited ? fmt(r.visited) : '—'}</b></div>
          <div><label>Deepest</label><b>${r.deepest ? fmt(r.deepest) : '—'}</b></div>
          <div><label>Kills</label><b>${dash(r.kills, true)}</b></div>
          <div><label>Ships lost</label><b>${dash(r.deaths, true)}</b></div>
          <div><label>Pace</label><b>${formatBoardPace(r)}</b></div>
          <div><label>Time</label><b>${formatRunTime(r.time_ms)}</b></div>
        </div>
      </article>`;
    })
    .join('')}</div>`;
}

export function renderLeaderboard(root, { onBack }) {
  root.innerHTML = `
    <div class="menu">
      <h1 class="logo">LANE<span>RECORDS</span></h1>
      <p class="tagline">${BOARD_SEASON_LABEL}. Open runs stay on the board until they arrive or are lost. Ranked by score and by time.</p>
      <div class="panel board-panel">
        <div class="board-tabs">
          <button class="tab active" data-sort="score">Score</button>
          <button class="tab" data-sort="time">Time</button>
        </div>
        <div class="board-body"><p class="muted center">Loading the lanes…</p></div>
      </div>
      <div class="menu-buttons">
        <button class="btn big" data-act="back">Back</button>
      </div>
    </div>`;

  let sort = 'score';
  const body = root.querySelector('.board-body');
  let first = true;

  const load = async () => {
    if (first) body.innerHTML = '<p class="muted center">Loading the lanes…</p>';
    try {
      const data = await fetchBoard(sort);
      const rows = data.rows || [];
      first = false;
      if (!rows.length) {
        body.innerHTML =
          sort === 'time'
            ? '<p class="muted center">No finished Terminus runs posted yet.</p>'
            : '<p class="muted center">No runs on the board yet.</p>';
        return;
      }
      body.innerHTML = `${renderTable(rows)}${renderCards(rows)}`;
    } catch {
      first = false;
      body.innerHTML = '<p class="muted center">The board is offline. Host the PHP API on this domain to post scores.</p>';
    }
  };

  const timer = window.setInterval(load, 20000);

  root.querySelector('.menu').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') {
      window.clearInterval(timer);
      onBack();
      return;
    }
    const tab = e.target.closest('[data-sort]');
    if (tab) {
      sort = tab.dataset.sort;
      first = true;
      root.querySelectorAll('.board-tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
      load();
    }
  });

  load();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
