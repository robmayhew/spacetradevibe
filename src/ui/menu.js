export function renderMenu(root, { hasSave, muted, onNew, onContinue, onToggleMute, onLeaderboard }) {
  root.innerHTML = `
    <div class="menu">
      <h1 class="logo">TXL<span>TRADER</span></h1>
      <p class="tagline">Haul cargo. Survive the lanes. Reach the Terminus.</p>
      <div class="menu-buttons">
        ${hasSave ? '<button class="btn primary big" data-act="continue">Continue</button>' : ''}
        <button class="btn ${hasSave ? '' : 'primary'} big" data-act="new">New Game</button>
        <div class="confirm hidden">
          <p>Start over? Your current save will be overwritten.</p>
          <button class="btn danger" data-act="new-confirm">Overwrite</button>
          <button class="btn" data-act="new-cancel">Cancel</button>
        </div>
        <button class="btn big" data-act="board">Leaderboard</button>
        <button class="btn ghost" data-act="mute">Sound: ${muted ? 'Off' : 'On'}</button>
      </div>
      <div class="howto panel">
        <h3>How to play</h3>
        <ul>
          <li>Pick a contract at the station, then <b>Launch</b> to haul it to the destination.</li>
          <li>Survive 2–5 waves of hostiles (sometimes a capital ship) to dock and get paid.</li>
          <li>Spend credits on upgrades. Each route has a difficulty from 1 to 10, and your <b>Ship Rating</b> must match it.</li>
          <li>Fly deeper into the galaxy and reach the <b>Terminus</b> to win.</li>
        </ul>
        <div class="keys">
          <span><kbd>WASD</kbd>/<kbd>Arrows</kbd> move</span>
          <span><kbd>Space</kbd> fire</span>
          <span><kbd>F</kbd> auto-fire</span>
          <span><kbd>1</kbd>-<kbd>4</kbd> / <kbd>Q</kbd><kbd>E</kbd> weapons</span>
          <span><kbd>Esc</kbd> pause</span>
        </div>
      </div>
    </div>`;
  const confirm = root.querySelector('.confirm');
  root.querySelector('.menu').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'continue') onContinue();
    if (act === 'new') hasSave ? confirm.classList.remove('hidden') : onNew();
    if (act === 'new-confirm') onNew();
    if (act === 'new-cancel') confirm.classList.add('hidden');
    if (act === 'board') onLeaderboard();
    if (act === 'mute') e.target.textContent = `Sound: ${onToggleMute() ? 'Off' : 'On'}`;
  });
}
