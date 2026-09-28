import { defineConfig } from 'vitest/config';

// Client tests live apart from the node:test suites (`tests/shared`, `tests/api`)
// so the built-in runner keeps handling the server/shared code while Vitest
// provides a jsdom environment for the React layer.
export default defineConfig({
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
