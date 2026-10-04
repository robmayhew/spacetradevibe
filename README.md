# TXL Trader

A top-down, low-poly space trading shooter built with Three.js. See [game.md](game.md) for the design index and [`design/`](design/) for the pages.

```bash
npm install
npm run dev
```

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move (the ship never turns) | WASD / Arrows | Left stick (analog: tilt less to go slower) or D-pad |
| Fire | Space / J | A or RT |
| Toggle auto-fire | F | X |
| Select weapon | 1–4, Q / E | LB / RB |
| Pause (retreat option) | Esc / P | Start |

Gamepads work in Chrome through the standard Gamepad API. In menus: D-pad / stick to move, A to select, B to go back, LB / RB for station tabs. **Logitech F310 on macOS: set the switch on the back to D.**

## Test console

Press <kbd>`</kbd> (backtick) to open the test console. It is always available under `npm run dev`; on a deployed build add `?console` to the URL. Type `help` for the full list; Tab completes, ↑/↓ recall history.

| Area | Commands |
| --- | --- |
| Ship & economy | `credits 5000` / `credits +500`, `repair`, `upgrade <system\|all> <level\|max>`, `rating 6`, `weapon <id\|all>`, `god` |
| Map | `goto <id\|name>`, `terminus`, `reveal`, `systems`, `contracts` |
| Flights | `fly [difficulty] [waves] [boss\|noboss] [nodock]`, `dock [tier] [undock]` |
| In combat | `kill`, `skip`, `win`, `die`, `spawn <type> [count]` |
| Docking | `land`, `spin <rad/s>` |
| Tuning | `speed <0-8>` (0 freezes), `tune ENEMIES.scout.fire.homing 2` (live, resets on reload), `status` |

Any command that changes the game marks the save as a **test run**, which can't be posted to the leaderboard.

## Layout

- `src/data.js` holds all tuning: upgrade costs and scaling, weapons, enemies and goods.
- `src/galaxy.js` builds a seeded map of 30 systems in 10 difficulty tiers, with the Terminus at the far end.
- `src/state.js` holds save data, the economy, contracts and ship rating.
- `src/views/` has the Three.js scenes: `dock` (docking/undocking mini-game), `travel` (combat), `starmap`, `backdrop`.
- `src/ui/` has the DOM screens: menu, station, and the in-flight HUD.
- `src/fx/` has the low-poly model builder (`model.js`), ship outlines, particles and starfield.

Progress auto-saves to `localStorage` each time you dock.

## Leaderboard on Plesk

The Vite build is static files. The shared Terminus board is PHP + MariaDB on the same domain (`/api`). A run is posted while the captain is still flying (`status: live`, shown as **In flight**) and again when they submit after delivering to the Terminus (`status: done`, **Arrived**). The Score tab includes open runs. The Time tab is finished runs only. In-flight rows drop off if they are not updated for 15 minutes.

1. In Plesk, create a MariaDB database and user, then run [`server/schema.sql`](server/schema.sql).
2. Copy [`server/api/config.example.php`](server/api/config.example.php) to `server/api/config.php` on the server and fill in those credentials. Keep `config.php` out of git.
3. Build with `npm run build`. Upload `dist/` into the domain's document root, and upload `server/api/` to `httpdocs/api/`.
4. Confirm PHP 8.1 or newer is selected for the domain (the Plesk default on current installs).
5. If this database already existed, also run the `ALTER TABLE` statements at the bottom of [`server/schema.sql`](server/schema.sql) (`runs.status` and `party_rooms.frame`).

No Node.js extension is required on the server. Local `npm run dev` still plays; the board panel explains it is offline until `/api` is on the same host. Escorts use an in-memory party API during `npm run dev`, so a second tab at `/controller.html?room=CODE` can join locally.

## Escorts

The bottom-left QR (or the 5-character code) opens the escort page. Linked devices fly helper ships in combat (pulse laser at 20% of the captain's bolt damage). They do not replace the captain: an escort exploding does not end the flight or count as a death.

- **Phone:** virtual stick and fire button.
- **Laptop:** the combat arena on that screen, **WASD / arrows** to move, **Space** to fire. Check **Use the on-screen stick** to join as a pad instead. The other machine must open the same origin (the deployed site, or the dev server via the host's LAN address). `localhost` on the captain's machine is not reachable from another laptop.

After pulling this change on Plesk, run the `ALTER TABLE` statements in [`server/schema.sql`](server/schema.sql) on the same MariaDB database, upload [`server/api/party.php`](server/api/party.php) and [`server/api/score.php`](server/api/score.php) / [`server/api/board.php`](server/api/board.php), and upload a fresh `dist/` that includes `controller.html`. Stick, fire, and combat frames go through `/api`. Each escort gets a distinct ship color.
