// @ts-check
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import html from '@html-eslint/eslint-plugin';
import htmlParser from '@html-eslint/parser';
import stylistic from '@stylistic/eslint-plugin';
import vitest from '@vitest/eslint-plugin';
import { globalIgnores } from 'eslint/config';
import importX from 'eslint-plugin-import-x';
import jsdoc from 'eslint-plugin-jsdoc';
import jsxA11yX from 'eslint-plugin-jsx-a11y-x';
import noFloatingPromise from 'eslint-plugin-no-floating-promise';
import reactHooks from 'eslint-plugin-react-hooks';
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
    rules: {
      // Use the recommended rules for HTML.
      ...Object.fromEntries(
        Object.keys(html.rules).map((value) => ['@html-eslint/' + value, 'error']),
      ),
      // We don't want these style rules
      '@html-eslint/attrs-newline': 'off',
      '@html-eslint/element-newline': 'off',
      '@html-eslint/indent': 'off',
      '@html-eslint/no-inline-styles': 'off',
      '@html-eslint/no-trailing-spaces': 'off',
      '@html-eslint/sort-attrs': 'off',
      // We don't want these rules
      '@html-eslint/no-heading-inside-button': 'off', // not important
      '@html-eslint/require-explicit-size': 'off', // we don't always have sizes when we use classes.
      '@html-eslint/require-form-method': 'off', // default is 'GET', that's fine.
      '@html-eslint/require-input-label': 'off', // we don't always have labels.
      // We prefer tags like `<img />` over `<img>`.
      '@html-eslint/no-extra-spacing-attrs': [
        'error',
        {
          enforceBeforeSelfClose: true,
          disallowMissing: true,
          disallowTabs: true,
          disallowInAssignment: true,
        },
      ],
      '@html-eslint/require-closing-tags': ['error', { selfClosing: 'always' }],
      // False positives for attribute/element baseline browser compatibility.
      '@html-eslint/use-baseline': 'off',
      // We violate these rules in a lot of places.
      '@html-eslint/id-naming-convention': 'off',
      '@html-eslint/quotes': ['error', 'double', { enforceTemplatedAttrValue: true }],
      '@html-eslint/require-button-type': 'off',
    },
    plugins: {
      '@html-eslint': html,
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    extends: compat.extends('plugin:you-dont-need-lodash-underscore/all'),

    plugins: {
      'import-x': importX,
      'no-floating-promise': noFloatingPromise,
      jsdoc,
      'react-hooks': reactHooks,
      vitest,
      'jsx-a11y-x': jsxA11yX,
      'you-dont-need-lodash-underscore': youDontNeedLodashUnderscore,
      'react-you-might-not-need-an-effect': reactYouMightNotNeedAnEffect,
      ...eslintReact.configs['recommended-typescript'].plugins,
      '@prairielearn': prairielearn,
      '@html-eslint': html,
      '@stylistic': stylistic,
    },

    languageOptions: {
      globals: { ...globals.node },
    },

    settings: {
      'jsx-a11y-x': {
        attributes: {
          for: ['for'],
        },
      },
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
      'no-duplicate-imports': 'error',

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

      // ...jsdoc.configs['flat/recommended-typescript-error'].rules,
      'jsdoc/convert-to-jsdoc-comments': [
        'error',
        {
          enforceJsdocLineStyle: 'single',
          contexts: ['FunctionDeclaration', 'TSDeclareFunction'],
          contextsBeforeAndAfter: ['TSPropertySignature'],
          allowedPrefixes: ['@ts-', 'istanbul ', 'c8 ', 'v8 ', 'eslint', 'prettier-', 'global'],
        },
      ],

      // Enable all jsx-a11y rules.
      ...jsxA11yX.configs.strict.rules,
      'jsx-a11y-x/anchor-ambiguous-text': 'error',
      'jsx-a11y-x/lang': 'error',
      'jsx-a11y-x/no-aria-hidden-on-focusable': 'error',
      // Bootstrap turns some elements into interactive elements.
      'jsx-a11y-x/no-noninteractive-element-to-interactive-role': [
        'error',
        {
          ul: ['listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid', 'role'],
          ol: ['listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid'],
          li: ['menuitem', 'option', 'row', 'tab', 'treeitem'],
          table: ['grid'],
          td: ['gridcell'],
        },
      ],

      // Use the recommended rules for react-hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // Use the recommended rules for react-you-might-not-need-an-effect as errors.
      ...Object.fromEntries(
        Object.keys(reactYouMightNotNeedAnEffect.configs['recommended'].rules ?? {}).map(
          (ruleName) => [ruleName, 'error'],
        ),
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

      // Use the recommended rules for HTML.
      ...Object.fromEntries(
        Object.keys(html.rules).map((value) => ['@html-eslint/' + value, 'error']),
      ),
      // We don't want these style rules
      '@html-eslint/attrs-newline': 'off',
      '@html-eslint/element-newline': 'off',
      '@html-eslint/indent': 'off',
      '@html-eslint/no-inline-styles': 'off',
      '@html-eslint/no-trailing-spaces': 'off',
      '@html-eslint/sort-attrs': 'off',
      // We don't want these rules
      '@html-eslint/no-heading-inside-button': 'off', // not important
      '@html-eslint/require-explicit-size': 'off', // we don't always have sizes when we use classes.
      '@html-eslint/require-form-method': 'off', // default is 'GET', that's fine.
      '@html-eslint/require-input-label': 'off', // we don't always have labels.
      // We prefer tags like `<img />` over `<img>`.
      '@html-eslint/no-extra-spacing-attrs': ['error', { enforceBeforeSelfClose: true }],
      '@html-eslint/require-closing-tags': ['error', { selfClosing: 'always' }],
      // False positives for attribute/element baseline browser compatibility.
      '@html-eslint/use-baseline': 'off',
      // We violate these rules in a lot of places.
      '@html-eslint/id-naming-convention': 'off',
      '@html-eslint/require-button-type': 'off',

      // These rules are implemented in `packages/eslint-plugin-prairielearn`.
      '@prairielearn/aws-client-mandatory-config': 'error',
      '@prairielearn/aws-client-shared-config': 'error',
      '@prairielearn/jsx-no-dollar-interpolation': 'error',
      '@prairielearn/no-unused-sql-blocks': 'error',

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

      '@stylistic/jsx-tag-spacing': [
        'error',
        {
          closingSlash: 'never',
          beforeSelfClosing: 'always',
          afterOpening: 'never',
          beforeClosing: 'allow',
        },
      ],
      '@stylistic/jsx-self-closing-comp': [
        'error',
        {
          component: true,
          html: true,
        },
      ],
      '@stylistic/jsx-curly-brace-presence': [
        'error',
        { props: 'never', children: 'never', propElementValues: 'always' },
      ],
      '@stylistic/jsx-sort-props': [
        'error',
        {
          callbacksLast: true,
          ignoreCase: true,
          locale: 'auto',
          multiline: 'ignore',
          noSortAlphabetically: true,
          reservedFirst: true,
          shorthandLast: true,
        },
      ],
      '@stylistic/lines-between-class-members': [
        'error',
        'always',
        { exceptAfterSingleLine: true },
      ],
      '@stylistic/no-tabs': 'error',
      // Blocks double-quote strings (unless a single quote is present in the
      // string) and backticks (unless there is a tag or substitution in place).
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],

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
  {
    files: ['**/*.html', '**/*.mustache'],
    rules: {
      '@html-eslint/no-extra-spacing-text': 'off',
      // We prefer tags like `<img>` over `<img />`.
      '@html-eslint/require-closing-tags': ['error', { selfClosing: 'never' }],
    },
    languageOptions: {
      parser: htmlParser,
      parserOptions: {
        templateEngineSyntax: htmlParser.TEMPLATE_ENGINE_SYNTAX.HANDLEBAR,
      },
    },
  },
  {
    files: ['**/*.mustache'],
    rules: {
      '@html-eslint/no-extra-spacing-attrs': 'off',
      // We are inconsistent about whether we use self-closing tags or not.
      '@html-eslint/require-closing-tags': 'off',
      // False positive
      '@html-eslint/no-duplicate-id': 'off',
      // False positive (https://github.com/yeonjuan/html-eslint/issues/392)
      '@html-eslint/no-duplicate-attrs': 'off',
      // False positive (alt added via bootstrap)
      '@html-eslint/require-img-alt': 'off',
      // Issue in 'pl-matrix-input'
      '@html-eslint/no-nested-interactive': 'off',
    },
  },
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

    // News items
    'apps/prairielearn/src/news_items/*',
  ]),
]);
