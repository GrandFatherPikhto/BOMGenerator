import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// The React application lives in `src/client`; the API is served by Express.
// During development Vite proxies `/api` to the server on port 3000.
export default defineConfig({
  root: path.resolve(projectRoot, 'src/client'),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Only real API paths are proxied. A plain '/api' prefix would also
      // swallow the client module /api.js and break the whole app.
      '^/api/': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(projectRoot, 'dist/client'),
    emptyOutDir: true,
  },
});
