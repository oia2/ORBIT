import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Shared code lives under `src/` but is consumed by both the browser and the
 * Fastify server, so it must stay platform-neutral. These are the modules that
 * rule applies to (plan.md "Structure Decision").
 */
const platformNeutralSources = ['src/shared/lib/**/*.ts', 'src/entities/planning/model/**/*.ts'];

const nodeOnlyModules = [
  'pg',
  'kysely',
  'fastify',
  '@fastify/*',
  'node:*',
  'fs',
  'path',
  'crypto',
  'os',
  'http',
  'https',
  'net',
  'stream',
  'url',
  'util',
  'child_process',
];

const domOnlyGlobals = [
  'window',
  'document',
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'navigator',
  'location',
  'IDBKeyRange',
  'IDBFactory',
  'DOMException',
];

/**
 * The client must never reach into the server. The server may import the shared
 * domain under `src/`, but never the reverse (plan.md "Structure Decision").
 * Repeated in every layer override because `no-restricted-imports` replaces
 * rather than merges its options.
 */
const noServerImports = {
  group: ['**/server/**', '**/server'],
  message: 'Client code must not import the server.',
};

const noPlatformDependencies = {
  group: nodeOnlyModules,
  message:
    'This module is shared with the server and the browser; it must not depend on Node built-ins or database drivers.',
};

const generatedFiles = [
  'node_modules/**',
  'node_modules.incomplete/**',
  'dist/**',
  'dist-server/**',
  'build/**',
  'coverage/**',
  'playwright-report/**',
  'test-results/**',
  'specs/001-personal-planning-loop/visual-reference/**',
];

export default tseslint.config(
  { ignores: generatedFiles },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2023 },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', prefer: 'type-imports' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**'],
              message: 'Only the app layer may import the app layer.',
            },
            noServerImports,
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/app/**', '@/pages/**'] },
            {
              group: ['@/features/*/**', '@/entities/*/**'],
              message: 'Use slice public APIs across slice boundaries.',
            },
            noServerImports,
          ],
        },
      ],
    },
  },
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/app/**', '@/pages/*/**'] },
            {
              group: ['@/features/*/**', '@/entities/*/**'],
              message: 'Use slice public APIs across slice boundaries.',
            },
            noServerImports,
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/app/**', '@/pages/**', '@/features/**', '@/entities/**'] },
            noServerImports,
          ],
        },
      ],
    },
  },
  {
    files: ['src/entities/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/app/**', '@/pages/**', '@/features/**'] },
            {
              group: ['@/entities/*/**'],
              message: 'Import another entity slice through its public API.',
            },
            noServerImports,
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/app/**', '@/pages/**', '@/features/**', '@/entities/**'] },
            noServerImports,
            noPlatformDependencies,
          ],
        },
      ],
    },
  },
  {
    files: ['src/entities/planning/model/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/app/**', '@/pages/**', '@/features/**'] },
            {
              group: ['@/entities/*/**'],
              message: 'Import another entity slice through its public API.',
            },
            noServerImports,
            noPlatformDependencies,
          ],
        },
      ],
    },
  },
  {
    // `src/shared/lib/**` and the planning domain model are shared with the
    // server, so they must not reach for the DOM.
    files: platformNeutralSources,
    rules: {
      'no-restricted-globals': [
        'error',
        ...domOnlyGlobals.map((name) => ({
          name,
          message:
            'This module is shared with the server and the browser; it must not use DOM-only globals.',
        })),
      ],
    },
  },
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2023 },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/app/**',
                '@/pages/**',
                '@/features/**',
                '@/entities/*/ui/**',
                '@/entities/planning/api/**',
              ],
              message: 'The server may only use the shared domain, not client layers.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...domOnlyGlobals.map((name) => ({
          name,
          message: 'The server has no DOM.',
        })),
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['e2e/**/*.{ts,tsx}', 'playwright.config.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
);
