# TXL Trader

A top-down neon space trading shooter built with Three.js. See [game.md](game.md) for the design.

```bash
npm install
npm run dev
```

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move (the ship never turns) |
| Space / J | Fire |
| F | Toggle auto-fire |
| 1–4, Q / E | Select weapon |
| Esc / P | Pause (retreat option) |

## Layout

- `src/data.js` holds all tuning: upgrade costs and scaling, weapons, enemies and goods.
- `src/galaxy.js` builds a seeded map of 30 systems in 10 difficulty tiers, with the Terminus at the far end.
- `src/state.js` holds save data, the economy, contracts and ship rating.
- `src/views/` has the Three.js scenes: `dock` (docking/undocking mini-game), `travel` (combat), `starmap`, `backdrop`.
- `src/ui/` has the DOM screens: menu, station, and the in-flight HUD.
- `src/fx/` has the low-poly model builder (`model.js`), ship outlines, particles and starfield.

Progress auto-saves to `localStorage` each time you dock.

## Leaderboard on Plesk

The Vite build is static files. The shared Terminus board is PHP + MariaDB on the same domain (`/api`). A run is posted once, the first time cargo is delivered to the Terminus.

1. In Plesk, create a MariaDB database and user, then run [`server/schema.sql`](server/schema.sql).
2. Copy [`server/api/config.example.php`](server/api/config.example.php) to `server/api/config.php` on the server and fill in those credentials. Keep `config.php` out of git.
3. Build with `npm run build`. Upload `dist/` into the domain's document root, and upload `server/api/` to `httpdocs/api/`.
4. Confirm PHP 8.1 or newer is selected for the domain (the Plesk default on current installs).

No Node.js extension is required on the server. Local `npm run dev` still plays; the board panel explains it is offline until `/api` is on the same host. Phone escorts use an in-memory party API during `npm run dev`, so a second tab at `/controller.html?room=CODE` can join locally.

## Phone escorts

The bottom-left QR opens a phone controller. Linked phones fly helper ships in combat (pulse laser at 20% of the captain's bolt damage). They do not replace the captain: an escort exploding does not end the flight or count as a death.

After pulling this change on Plesk, run the `party_live` statement in [`server/schema.sql`](server/schema.sql) on the same MariaDB database, upload [`server/api/party.php`](server/api/party.php), and upload a fresh `dist/` that includes `controller.html`. Stick and fire go through `/api`, so a phone can join from cellular or another network. Each escort gets a distinct ship color.
