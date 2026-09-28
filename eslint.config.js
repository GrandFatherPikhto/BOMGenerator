import js from '@eslint/js';
import globals from 'globals';

// Flat config: the codebase mixes Node (server/shared/scripts) and browser
// (React client) code, so both global sets are enabled for every JS/JSX file.
export default [
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'techdocs/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-alert': 'warn',
      'no-new': 'warn',
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
