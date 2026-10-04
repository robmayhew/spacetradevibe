[← Design index](../../game.md)

# Tech Stack

- JavaScript (ES modules), built and served with Vite (`npm run dev`).
- Three.js for all rendering, with a bloom post-process for the neon look.
- Menus, the station screen and the in-flight HUD are HTML/CSS layered over the Three.js canvas.
- Sound effects are generated in code with WebAudio. There are no image or audio files.
- Progress auto-saves to the browser's `localStorage` each time you dock.
