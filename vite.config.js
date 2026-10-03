import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { partyDevPlugin } from './server/party-dev.js';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [partyDevPlugin()],
  server: { host: true },
  optimizeDeps: { include: ['qrcode'] },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        controller: resolve(root, 'controller.html'),
      },
    },
  },
});
