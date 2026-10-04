[← Design index](../../game.md)

# Tech Stack

- JavaScript (ES modules), built and served with Vite (`npm run dev`).
- Three.js for all rendering. Ships, stations and rocks are low-poly 3D models lit by a single key light; a light bloom post-process makes only bright things glow (shots, engines, warning lights, explosions). See [Visual Style](visual-style.md).
- Menus, the station screen and the in-flight HUD are HTML/CSS layered over the Three.js canvas.
- Sound effects are generated in code with WebAudio. There are no image or audio files.
- Progress auto-saves to the browser's `localStorage` each time you dock.
- **Online features** ([Escorts](../online/escorts.md), [Leaderboard](../online/leaderboard.md)) use a small PHP 8.1 + MariaDB API served at `/api` on the same domain (`server/api/`). Under `npm run dev`, a Vite plugin (`server/party-dev.js`) stands in for it locally. QR codes for escorts are drawn with the `qrcode` package.
- A [test console](test-console.md) for cheats and tuning is built in.
