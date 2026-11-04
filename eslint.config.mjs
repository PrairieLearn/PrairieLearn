// @ts-check
import path from 'path';

import html from '@html-eslint/eslint-plugin';
import htmlParser from '@html-eslint/parser';
import tsParser from '@typescript-eslint/parser';
import { defineConfig, globalIgnores } from 'eslint/config';

import prairielearn from '@prairielearn/eslint-plugin';

/**
 * oxlint (see `.oxlintrc.json`) lints JS and TS files. ESLint only runs what oxlint can't:
 *
 * - `@prairielearn/safe-db-types`, which needs TypeScript type information that oxlint
 *   doesn't provide to JS plugins (https://github.com/oxc-project/oxc/issues/19596).
 * - HTML and mustache files, which oxlint can't parse.
 */
export default defineConfig([
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    // `safe-db-types` only inspects JSX, so only `.tsx` files need type information.
    files: ['apps/prairielearn/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: path.join(import.meta.dirname, 'apps', 'prairielearn'),
      },
    },
    plugins: {
      '@prairielearn': prairielearn,
    },
    rules: {
      '@prairielearn/safe-db-types': [
        'error',
        {
          allowDbTypes: [
            // This is innocuous, it's just a string enum.
            'SprocUsersGetDisplayedRoleSchema',
            // The following are just enums.
            'EnumAiQuestionGenerationMessageStatus',
            'EnumAiGradingProviderSchema',
            'EnumAiGradingProvider',
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html', '**/*.mustache'],
    languageOptions: {
      parser: htmlParser,
      parserOptions: {
        rawContentTags: ['markdown'],
        templateEngineSyntax: htmlParser.TEMPLATE_ENGINE_SYNTAX.HANDLEBAR,
      },
    },
    plugins: {
      '@html-eslint': html,
      '@prairielearn': prairielearn,
    },
    rules: {
      ...Object.fromEntries(
        Object.keys(html.rules).map((rule) => [`@html-eslint/${rule}`, 'error']),
      ),
      // We don't want these style rules.
      '@html-eslint/attrs-newline': 'off',
      '@html-eslint/element-newline': 'off',
      '@html-eslint/indent': 'off',
      '@html-eslint/no-extra-spacing-text': 'off',
      '@html-eslint/no-inline-styles': 'off',
      '@html-eslint/no-trailing-spaces': 'off',
      '@html-eslint/sort-attrs': 'off',
      '@html-eslint/no-extra-spacing-attrs': [
        'error',
        {
          disallowInAssignment: true,
          disallowMissing: true,
          disallowTabs: true,
          enforceBeforeSelfClose: true,
        },
      ],
      '@html-eslint/quotes': ['error', 'double', { enforceTemplatedAttrValue: true }],
      // We prefer tags like `<img>` over `<img />` in HTML files.
      '@html-eslint/require-closing-tags': ['error', { selfClosing: 'never' }],
      // PrairieLearn elements (e.g. `<pl-sketch-tool id="fd">`) treat `id` as an
      // element-scoped identifier, not a DOM id, so use our variant of this rule.
      '@html-eslint/no-duplicate-id': 'off',
      '@prairielearn/html-no-duplicate-id': 'error',
      '@html-eslint/id-naming-convention': 'off', // We violate this in a lot of places.
      '@html-eslint/no-heading-inside-button': 'off', // Not important.
      '@html-eslint/require-explicit-size': 'off', // We don't always have sizes when we use classes.
      '@html-eslint/require-form-method': 'off', // The default of `GET` is fine.
      '@html-eslint/require-input-label': 'off', // We don't always have labels.
      '@html-eslint/use-baseline': 'off', // False positives for browser compatibility.

      // TODO: Fix these rule violations.
      '@html-eslint/no-extra-spacing-tags': 'off',
      '@html-eslint/require-button-type': 'off',
      '@html-eslint/require-content': 'off',
    },
  },
  {
    files: ['**/*.mustache'],
    rules: {
      '@html-eslint/no-extra-spacing-attrs': 'off',
      // We are inconsistent about whether we use self-closing tags or not.
      '@html-eslint/require-closing-tags': 'off',
      // False positive (https://github.com/yeonjuan/html-eslint/issues/392)
      '@html-eslint/no-duplicate-attrs': 'off',
      // False positive (alt added via bootstrap)
      '@html-eslint/require-img-alt': 'off',
      // Issue in 'pl-matrix-input'
      '@html-eslint/no-nested-interactive': 'off',
    },
  },
  globalIgnores([
    '.claude/worktrees/*',
    '.playwright-mcp/*',
    '.venv/*',
    'coverage/*',
    'docs/*',
    'node_modules/*',
    'out/*',
    'site/*',
    'test-results/*',
    'testCourse',
    'workspaces/*',
    'apps/*/coverage/*',
    'apps/*/dist/*',
    'apps/course-agent/.wrangler/*',
    // Wrangler owns this declaration, including its generated lint directives.
    'apps/course-agent/src/env.d.ts',
    'apps/course-agent/generated/**',
    'apps/prairielearn/playwright/.cache/*',
    'apps/prairielearn/public/*',
    'apps/prairielearn/test-results/*',
    'apps/prairielearn/v2-question-servers/*',
    'packages/*/coverage/*',
    'packages/*/dist/*',
  ]),
]);
