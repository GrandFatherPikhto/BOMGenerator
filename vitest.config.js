import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Client tests live apart from the node:test suites (`tests/shared`, `tests/api`)
// so the built-in runner keeps handling the server/shared code while Vitest
// provides a jsdom environment for the React layer.
export default defineConfig({
  // The React plugin transforms JSX in the components under test (the Vite
  // config is not picked up here, so the plugin has to be declared again).
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/client/**/*.test.{js,jsx}'],
    setupFiles: ['./tests/client/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/client/**/*.{js,jsx}'],
      reporter: ['text', 'html'],
    },
  },
});
