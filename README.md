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
- `src/galaxy.js` builds a seeded map of 100 systems in 10 difficulty tiers, with the Terminus at the far end.
- `src/state.js` holds save data, the economy, contracts and ship rating.
- `src/views/` has the Three.js scenes: `travel` (combat), `starmap`, `backdrop`.
- `src/ui/` has the DOM screens: menu, station, and the in-flight HUD.
- `src/fx/` has the neon shapes, particles and starfield.

Progress auto-saves to `localStorage` each time you dock.
