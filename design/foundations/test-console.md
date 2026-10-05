[← Design index](../../game.md)

# Test Console

A developer console for testing any part of the game quickly. Press <kbd>`</kbd> (backtick) to open and close it. It's always available under `npm run dev`; on a deployed build add `?console` to the URL (for example `http://localhost:4173/?console` with `npm run preview`).

Type `help` for the list. **Tab** completes command names and arguments, and **↑ / ↓** recall earlier commands. While the console is open, keys go to the console, not the ship.

| Area | Commands |
| --- | --- |
| Ship & economy | `credits 5000` / `credits +500`, `repair`, `upgrade <system/all> <level/max>`, `rating 6`, `weapon <id/all>`, `god` (no damage, including docking bumps) |
| Map | `goto <id or name>`, `terminus` (jump next to it), `reveal`, `systems`, `contracts` (re-roll) |
| Test flights | `fly [difficulty] [waves] [boss/noboss] [nodock]`, e.g. `fly 6 3 boss nodock`. Test flights never go to the Terminus. |
| Docking | `dock [tier] [undock]` runs a docking scene by itself; during docking, `land` finishes it and `spin <rad/s>` sets the station's rotation |
| In combat | `kill`, `skip` (end the wave), `win` (clear the route), `die` (test the tow screen), `spawn <type> [count]` (types include `boss`) |
| Input | `pad`: shows the gamepad name, layout, held buttons, stick and raw axes (press a button first) |
| Tuning | `speed <0–8>` (0 freezes, 0.25 slow motion, 4 fast-forward), `tune <path> [value]` to read or change a balance value live (e.g. `tune ENEMIES.scout.fire.homing 2`; resets on reload), `status` |

**Test runs:** any command that changes the game marks the save as a test run. Test runs are never posted to the [Leaderboard](../online/leaderboard.md), neither as live rows nor at the Terminus; the victory screen explains why and hides the Submit button.
