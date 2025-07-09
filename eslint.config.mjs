// @ts-check
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import vitest from '@vitest/eslint-plugin';
import { globalIgnores } from 'eslint/config';
import importX from 'eslint-plugin-import-x';
import noFloatingPromise from 'eslint-plugin-no-floating-promise';
import reactYouMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect';
import youDontNeedLodashUnderscore from 'eslint-plugin-you-dont-need-lodash-underscore';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import prairielearn from '@prairielearn/eslint-plugin';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const NO_RESTRICTED_SYNTAX = [
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.object.name="MathJax"][callee.property.name=/^(typeset|tex2chtml|tex2svg)$/]',
    message: "Don't use the synchronous MathJax API; use a function like typesetPromise() instead.",
  },
  {
    selector: 'MemberExpression[object.name="MathJax"][property.name="Hub"]',
    message: 'Use MathJax.typesetPromise() instead of MathJax.Hub',
  },
  {
    selector: 'ImportDeclaration[source.value="fs-extra"]:has(ImportNamespaceSpecifier)',
    message: 'Use a default import instead of a namespace import for fs-extra',
  },
];

export default tseslint.config([
  js.configs.recommended,
  tseslint.configs.stylistic,
  tseslint.configs.strict,
  {
    extends: compat.extends('plugin:you-dont-need-lodash-underscore/all'),

    plugins: {
      'import-x': importX,
      'no-floating-promise': noFloatingPromise,
      vitest,
      'you-dont-need-lodash-underscore': youDontNeedLodashUnderscore,
      'react-you-might-not-need-an-effect': reactYouMightNotNeedAnEffect,
      ...eslintReact.configs['recommended-typescript'].plugins,
      '@prairielearn': prairielearn,
    },

    languageOptions: {
      globals: { ...globals.node },
    },

    settings: {
      'import-x/parsers': {
        '@typescript-eslint/parser': ['.ts', '.js'],
      },

      'import-x/resolver': {
        typescript: true,
        node: true,
      },

      ...eslintReact.configs['recommended-typescript'].settings,
      'react-x': {
        ...eslintReact.configs['recommended-typescript'].settings['react-x'],
        // This is roughly the version that Preact's compat layer supports.
        version: '18.0.0',
      },
    },

    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },

    rules: {
      curly: ['error', 'multi-line', 'consistent'],
      eqeqeq: ['error', 'smart'],
      'handle-callback-err': 'error',
      'no-template-curly-in-string': 'error',
      'no-restricted-globals': [
        'error',
        // These are not available in ES modules.
        '__filename',
        '__dirname',
      ],
      'no-restricted-syntax': ['error', ...NO_RESTRICTED_SYNTAX],
      'object-shorthand': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],

      // Blocks double-quote strings (unless a single quote is present in the
      // string) and backticks (unless there is a tag or substitution in place).
      quotes: ['error', 'single', { avoidEscape: true }],

      // Enforce alphabetical order of import specifiers within each import group.
      // The import-x/order rule handles the overall sorting of the import groups.
      'sort-imports': [
        'error',
        {
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        },
      ],

      'import-x/order': [
        'error',
        {
          'newlines-between': 'always',

          alphabetize: {
            order: 'asc',
          },

          pathGroups: [
            {
              pattern: '@prairielearn/**',
              group: 'external',
              position: 'after',
            },
          ],

          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],

      'no-floating-promise/no-floating-promise': 'error',

      // Use the recommended rules for react-you-might-not-need-an-effect as errors.
      ...Object.fromEntries(
        Object.keys(reactYouMightNotNeedAnEffect.rules).map((ruleName) => [
          reactYouMightNotNeedAnEffect.meta.name + '/' + ruleName,
          'error',
        ]),
      ),

      // Use the recommended rules for eslint-react as errors.
      ...Object.fromEntries(
        Object.entries(eslintReact.configs['recommended-typescript'].rules).map(
          ([ruleName, severity]) => [ruleName, severity === 'off' ? 'off' : 'error'],
        ),
      ),

      // Use the recommended rules for vitest
      ...vitest.configs.recommended.rules,

      // This gives a lot of false positives; we sometimes author tests that
      // have the assertion in a helper function. We could refactor them in
      // the future, but for now we'll disable this rule.
      'vitest/expect-expect': ['off'],

      // We violate this rule in a lot of places. We'll turn it off for now.
      'vitest/no-identical-title': ['off'],

      // These rules are implemented in `packages/eslint-plugin-prairielearn`.
      '@prairielearn/aws-client-mandatory-config': 'error',
      '@prairielearn/aws-client-shared-config': 'error',
      '@prairielearn/jsx-no-dollar-interpolation': 'error',

      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],

      // We use empty functions in quite a few places, so we'll disable this rule.
      '@typescript-eslint/no-empty-function': 'off',

      // Look, sometimes we just want to use `any`.
      '@typescript-eslint/no-explicit-any': 'off',

      // This was enabled when we upgraded to `@typescript-eslint/*` v6.
      // TODO: fix the violations so we can enable this rule.
      '@typescript-eslint/no-dynamic-delete': 'off',

      // Replaces the standard `no-unused-vars` rule.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // The _.omit function is still useful in some contexts.
      'you-dont-need-lodash-underscore/omit': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_RESTRICTED_SYNTAX,
        {
          selector: 'MemberExpression[object.name="module"][property.name="exports"]',
          message: 'module.exports should not be used in TypeScript files',
        },
      ],
    },
  },
  {
    files: ['apps/prairielearn/assets/scripts/**/*', 'apps/prairielearn/elements/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jquery,
      },
    },
  },
  {
    files: ['packages/preact-cjs/src/**/*', 'packages/preact-cjs-compat/src/**/*'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  globalIgnores([
    '.venv/*',
    '.yarn/*',
    'docs/*',
    'node_modules/*',
    'exampleCourse/*',
    'testCourse/*',
    'coverage/*',
    'out/*',
    'workspaces/*',
    'site/*',

    // Coverage reports
    'coverage/*',
    'apps/*/coverage/*',
    'packages/*/coverage/*',

    // We don't want to lint these files.
    'apps/prairielearn/v2-question-servers/*',
    'apps/prairielearn/public/*',

    // Transpiled code
    'apps/*/dist/*',
    'apps/prairielearn/public/build/*',
    'packages/*/dist/*',
  ]),
]);
