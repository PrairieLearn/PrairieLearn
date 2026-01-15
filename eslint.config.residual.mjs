/**
 * Residual ESLint configuration for rules that oxlint cannot handle.
 *
 * This config includes:
 * - @html-eslint: HTML/Mustache file linting (oxlint can't parse HTML)
 * - @stylistic: Stylistic rules (token-based, not supported by oxlint jsPlugins)
 * - perfectionist: Sorting rules (token-based, not supported by oxlint jsPlugins)
 * - @prairielearn/safe-db-types: Uses TypeScript type-checker APIs
 * - jsx-a11y-x/no-noninteractive-element-interactions: Not in oxlint
 *
 * Most other plugins have been migrated to oxlint via native plugins or jsPlugins.
 * Run oxlint first for faster feedback, then this config for remaining rules.
 */
// @ts-check
import { FlatCompat } from '@eslint/eslintrc';
import eslintReact from '@eslint-react/eslint-plugin';
import html from '@html-eslint/eslint-plugin';
import htmlParser from '@html-eslint/parser';
import stylistic from '@stylistic/eslint-plugin';
import { globalIgnores } from 'eslint/config';
import importX from 'eslint-plugin-import-x';
import jsdoc from 'eslint-plugin-jsdoc';
import jsxA11yX from 'eslint-plugin-jsx-a11y-x';
import perfectionist from 'eslint-plugin-perfectionist';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import youDontNeedLodash from 'eslint-plugin-you-dont-need-lodash-underscore';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import prairielearn from '@prairielearn/eslint-plugin';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default tseslint.config([
  // Global ignores - same as main config
  globalIgnores([
    '.venv/*',
    '.yarn/*',
    'docs/*',
    'node_modules/*',
    'testCourse',
    'exampleCourse/**/*.js',
    'coverage/*',
    'out/*',
    'workspaces/*',
    'site/*',
    'apps/*/coverage/*',
    'packages/*/coverage/*',
    'apps/prairielearn/v2-question-servers/*',
    'apps/prairielearn/public/*',
    'apps/*/dist/*',
    'apps/prairielearn/public/build/*',
    'packages/*/dist/*',
    'apps/prairielearn/src/news_items/*',
  ]),

  // HTML/Mustache linting
  {
    plugins: {
      '@html-eslint': html,
    },
    rules: {
      ...Object.fromEntries(
        Object.keys(html.rules).map((value) => ['@html-eslint/' + value, 'error']),
      ),
      '@html-eslint/attrs-newline': 'off',
      '@html-eslint/element-newline': 'off',
      '@html-eslint/indent': 'off',
      '@html-eslint/no-inline-styles': 'off',
      '@html-eslint/no-trailing-spaces': 'off',
      '@html-eslint/sort-attrs': 'off',
      '@html-eslint/no-heading-inside-button': 'off',
      '@html-eslint/require-explicit-size': 'off',
      '@html-eslint/require-form-method': 'off',
      '@html-eslint/require-input-label': 'off',
      '@html-eslint/no-extra-spacing-attrs': [
        'error',
        {
          disallowInAssignment: true,
          disallowMissing: true,
          disallowTabs: true,
          enforceBeforeSelfClose: true,
        },
      ],
      '@html-eslint/require-closing-tags': ['error', { selfClosing: 'always' }],
      '@html-eslint/use-baseline': 'off',
      '@html-eslint/id-naming-convention': 'off',
      '@html-eslint/quotes': ['error', 'double', { enforceTemplatedAttrValue: true }],
      '@html-eslint/require-button-type': 'off',
    },
  },

  // JS/TS files - plugins that oxlint can't handle
  // Note: We include typescript-eslint plugin (with rules disabled) to support eslint-disable comments
  {
    extends: [
      // Include tseslint but we'll disable its rules - needed for eslint-disable comments
      ...tseslint.configs.recommended,
      // Include lodash plugin with rules disabled - needed for eslint-disable comments
      ...compat.extends('plugin:you-dont-need-lodash-underscore/all'),
    ],
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            '.dependency-cruiser.js',
            'eslint.config.mjs',
            'eslint.config.residual.mjs',
            'vitest.config.ts',
            'scripts/check-npm-packages.mjs',
            'scripts/fix-workspace-versions-before-publish.mjs',
            'scripts/gen-trace-sample-cookie.mjs',
            'scripts/validate-links.mjs',
            'apps/grader-host/vitest.config.ts',
            'apps/prairielearn/playwright.config.ts',
            'apps/prairielearn/vitest.config.ts',
            'apps/prairielearn/vite.config.ts',
            'apps/workspace-host/vitest.config.ts',
            'packages/zod/vitest.config.ts',
            'packages/eslint-plugin-prairielearn/vitest.config.ts',
            'packages/ui/vitest.config.ts',
            'packages/migrations/vitest.config.ts',
            'packages/config/vitest.config.ts',
            'packages/opentelemetry/vitest.config.ts',
            'packages/sanitize/vitest.config.ts',
            'packages/markdown/vitest.config.ts',
            'packages/html-ejs/vitest.config.ts',
            'packages/docker-utils/vitest.config.ts',
            'packages/utils/vitest.config.ts',
            'packages/html/vitest.config.ts',
            'packages/flash/vitest.config.ts',
            'packages/formatter/vitest.config.ts',
            'packages/postgres/vitest.config.ts',
            'packages/marked-mathjax/vitest.config.ts',
            'packages/csv/vitest.config.ts',
            'packages/path-utils/vitest.config.ts',
            'packages/express-list-endpoints/vitest.config.ts',
            'packages/run/vitest.config.ts',
            'packages/compiled-assets/vitest.config.ts',
            'packages/error/vitest.config.ts',
            'packages/session/vitest.config.ts',
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 50,
        },
      },
    },
    plugins: {
      ...eslintReact.configs['recommended-typescript'].plugins,
      '@prairielearn': prairielearn,
      '@stylistic': stylistic,
      'import-x': importX,
      jsdoc,
      'jsx-a11y-x': jsxA11yX,
      perfectionist,
      'react-hooks': reactHooks,
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      // Disable all @typescript-eslint rules - they're handled by oxlint
      // We include the plugin only to support eslint-disable comments in code
      ...Object.fromEntries(
        Object.keys(tseslint.configs.recommended[2]?.rules || {}).map((rule) => [rule, 'off']),
      ),
      ...Object.fromEntries(
        Object.keys(tseslint.configs.strict[3]?.rules || {}).map((rule) => [rule, 'off']),
      ),
      ...Object.fromEntries(
        Object.keys(tseslint.configs.stylistic[3]?.rules || {}).map((rule) => [rule, 'off']),
      ),

      // Disable all unicorn rules - they're handled by oxlint
      // We include the plugin only to support eslint-disable comments in code
      ...Object.fromEntries(
        Object.keys(eslintPluginUnicorn.rules || {}).map((rule) => [`unicorn/${rule}`, 'off']),
      ),

      // Disable all jsdoc rules - they're handled by oxlint
      // We include the plugin only to support eslint-disable comments in code
      ...Object.fromEntries(
        Object.keys(jsdoc.rules || {}).map((rule) => [`jsdoc/${rule}`, 'off']),
      ),

      // Disable all import-x rules - they're handled by oxlint
      // We include the plugin only to support eslint-disable comments in code
      ...Object.fromEntries(
        Object.keys(importX.rules || {}).map((rule) => [`import-x/${rule}`, 'off']),
      ),

      // Disable all react-hooks rules - they're handled by oxlint
      // We include the plugin only to support eslint-disable comments in code
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/rules-of-hooks': 'off',

      // Disable all you-dont-need-lodash-underscore rules - they're handled by oxlint jsPlugins
      // (rules are enabled by the extends above, we disable them here)
      ...Object.fromEntries(
        Object.keys(youDontNeedLodash.rules || {}).map((rule) => [
          `you-dont-need-lodash-underscore/${rule}`,
          'off',
        ]),
      ),

      // Disable all jsx-a11y-x rules - they're handled by oxlint
      // We include the plugin only for no-noninteractive-element-interactions (not in oxlint)
      ...Object.fromEntries(
        Object.keys(jsxA11yX.rules || {}).map((rule) => [`jsx-a11y-x/${rule}`, 'off']),
      ),
      // This rule is not available in oxlint, so we enable it here
      'jsx-a11y-x/no-noninteractive-element-interactions': [
        'error',
        {
          body: ['onError', 'onLoad'],
          iframe: ['onError', 'onLoad'],
          img: ['onError', 'onLoad'],
        },
      ],

      // @eslint-react (complex plugin structure, not supported by oxlint jsPlugins)
      ...eslintReact.configs['recommended-typescript'].rules,
      '@eslint-react/dom/no-string-style-prop': 'off',
      '@eslint-react/dom/no-unknown-property': 'off',
      '@eslint-react/jsx-no-undef': 'off',
      '@eslint-react/jsx-uses-react': 'off',
      '@eslint-react/jsx-uses-vars': 'off',
      '@eslint-react/naming-convention/use-state': 'off',
      '@eslint-react/no-forbidden-props': ['error', { forbid: ['/_/'] }],

      // @stylistic rules
      '@stylistic/jsx-curly-brace-presence': [
        'error',
        { children: 'never', propElementValues: 'always', props: 'never' },
      ],
      '@stylistic/jsx-self-closing-comp': ['error', { component: true, html: true }],
      '@stylistic/jsx-tag-spacing': [
        'error',
        {
          afterOpening: 'never',
          beforeClosing: 'allow',
          beforeSelfClosing: 'always',
          closingSlash: 'never',
        },
      ],
      '@stylistic/lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
      '@stylistic/no-tabs': 'error',
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', next: 'function', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'import' },
        { blankLine: 'any', next: 'import', prev: 'import' },
      ],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],

      // @prairielearn rules (safe-db-types uses TypeScript APIs not supported in oxlint JS plugins)
      '@prairielearn/safe-db-types': [
        'error',
        { allowDbTypes: ['SprocUsersGetDisplayedRoleSchema'] },
      ],

      // perfectionist - sorting rules (token-based, not supported by oxlint jsPlugins)
      'perfectionist/sort-jsx-props': [
        'error',
        {
          customGroups: [
            { elementNamePattern: '^on[A-Z]', groupName: 'callback' },
            { elementNamePattern: '^(key|ref)$', groupName: 'reserved' },
          ],
          groups: ['reserved', 'unknown', 'shorthand-prop', 'callback'],
          ignoreCase: true,
          type: 'unsorted',
        },
      ],
    },
  },

  // HTML files
  {
    files: ['**/*.html'],
    languageOptions: {
      parser: htmlParser,
    },
  },

  // Mustache files
  {
    files: ['**/*.mustache'],
    languageOptions: {
      parser: htmlParser,
    },
    rules: {
      '@html-eslint/no-duplicate-attrs': 'off',
      '@html-eslint/no-duplicate-id': 'off',
      '@html-eslint/no-extra-spacing-attrs': 'off',
      '@html-eslint/no-nested-interactive': 'off',
      '@html-eslint/require-closing-tags': 'off',
      '@html-eslint/require-img-alt': 'off',
    },
  },

  // Browser scripts - disable type-aware linting (these aren't in tsconfig)
  {
    files: ['apps/prairielearn/assets/scripts/**/*', 'apps/prairielearn/elements/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.jquery },
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      // Disable type-aware rules for browser scripts
      '@prairielearn/safe-db-types': 'off',
    },
  },
]);
