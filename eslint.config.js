import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Flat ESLint config for every workspace.
 *
 * Under ADR-002 there is no compiler, so lint rules carry more weight than usual —
 * they are part of the agreed compensating controls for having no type checker.
 */
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'prototypes/**'],
  },

  js.configs.recommended,

  // Shared package — must stay environment-agnostic (07_PROJECT_STRUCTURE.md §2)
  {
    files: ['packages/shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // No browser or Node globals: this code runs in both.
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'packages/shared must stay environment-agnostic.' },
        { name: 'document', message: 'packages/shared must stay environment-agnostic.' },
        { name: 'process', message: 'packages/shared must stay environment-agnostic.' },
      ],
    },
  },

  // Express API
  {
    // `.mjs` covers apps/api/scripts — one-off maintenance scripts run directly with node.
    files: ['apps/api/**/*.js', 'apps/api/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // React client
  {
    files: ['apps/web/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Build scripts and config files run in Node
  {
    files: ['**/*.config.js', 'apps/web/scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
