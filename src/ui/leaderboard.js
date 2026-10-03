import { fetchBoard, formatRunTime } from '../score.js';

const fmt = (n) => Math.round(n).toLocaleString();

export function renderLeaderboard(root, { onBack }) {
  root.innerHTML = `
    <div class="menu">
      <h1 class="logo">LANE<span>RECORDS</span></h1>
      <p class="tagline">First delivery to the Terminus. Ranked by score and by time.</p>
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

  const load = async () => {
    body.innerHTML = '<p class="muted center">Loading the lanes…</p>';
    try {
      const data = await fetchBoard(sort);
      const rows = data.rows || [];
      if (!rows.length) {
        body.innerHTML = '<p class="muted center">No Terminus runs posted yet.</p>';
        return;
      }
      body.innerHTML = `<table class="board">
        <thead><tr><th>#</th><th>Callsign</th><th>Score</th><th>Time</th></tr></thead>
        <tbody>${rows
          .map(
            (r, i) => `<tr>
              <td>${r.rank ?? i + 1}</td>
              <td>${escapeHtml(r.callsign)}</td>
              <td>${fmt(r.score)}</td>
              <td>${formatRunTime(r.time_ms)}</td>
            </tr>`,
          )
          .join('')}</tbody>
      </table>`;
    } catch {
      body.innerHTML = '<p class="muted center">The board is offline. Host the PHP API on this domain to post and view scores.</p>';
    }
  };

  root.querySelector('.menu').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') onBack();
    const tab = e.target.closest('[data-sort]');
    if (tab) {
      sort = tab.dataset.sort;
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
