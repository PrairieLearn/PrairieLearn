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
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
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
      unicorn: eslintPluginUnicorn,
      '@prairielearn': prairielearn,
      '@html-eslint': html,
      '@stylistic': stylistic,
    },

    languageOptions: {
      globals: { ...globals.node },
    },

    settings: {
      jsdoc: {
        exemptDestructuredRootsFromChecks: true,
        contexts: [
          // We don't want to require documentation of a 'locals' (res.locals) variable
          // AST Parser: https://github.com/es-joy/jsdoccomment
          {
            comment: 'JsdocBlock:not(:has(JsdocTag[tag="param"][name="locals"]))',
            context: 'FunctionDeclaration',
          },
          {
            comment: 'JsdocBlock:not(:has(JsdocTag[tag="param"][name="locals"]))',
            context: 'FunctionExpression',
          },
          'ArrowFunctionExpression',
          'TSDeclareFunction',
        ],
      },
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
      ...js.configs.all.rules,
      'arrow-body-style': 'off', // TODO: Consider enabling this
      'array-callback-return': 'off',
      'capitalized-comments': 'off',
      camelcase: 'off',
      'class-methods-use-this': 'off',
      'consistent-this': 'off',
      'consistent-return': 'off', // TODO: Consider enabling this
      complexity: 'off',
      curly: ['error', 'multi-line', 'consistent'],
      'default-case': 'off', // TODO: Consider enabling this
      'dot-notation': 'off', // TODO: Consider enabling this
      eqeqeq: ['error', 'smart'],
      'func-names': 'off', // TODO: Consider enabling this
      'func-style': 'off',
      'guard-for-in': 'off',
      'handle-callback-err': 'error',
      'id-length': 'off',
      'init-declarations': 'off', // TODO: Consider enabling this
      'logical-assignment-operators': 'off', // TODO: Consider enabling this
      'no-bitwise': 'off',
      'no-empty-function': 'off', // TODO: Consider enabling this
      'no-implicit-coercion': 'off', // TODO: Consider enabling this
      'no-invalid-this': 'off', // TODO: Consider enabling this
      'no-lonely-if': 'off', // TODO: Consider enabling this
      'no-negated-condition': 'off',
      'no-new': 'off', // TODO: Consider enabling this
      'no-template-curly-in-string': 'error',
      'no-promise-executor-return': 'off',
      'no-redeclare': 'off',
      'no-restricted-globals': [
        'error',
        // These are not available in ES modules.
        '__filename',
        '__dirname',
      ],
      'no-restricted-syntax': ['error', ...NO_RESTRICTED_SYNTAX],
      'no-shadow': 'off',
      'no-unmodified-loop-condition': 'off',
      'no-unneeded-ternary': 'off', // TODO: Consider enabling this
      'no-useless-assignment': 'off', // TODO: Consider enabling this
      'no-useless-concat': 'off', // TODO: Consider enabling this
      'no-useless-constructor': 'off',
      'no-useless-return': 'off', // TODO: Consider enabling this
      'object-shorthand': 'error',
      'one-var': ['off', 'never'], // TODO: Consider enabling this
      'prefer-arrow-callback': 'off',
      'prefer-const': ['error', { destructuring: 'all' }],
      'prefer-destructuring': 'off', // TODO: Consider enabling this
      'prefer-named-capture-group': 'off',
      'prefer-object-has-own': 'off', // TODO: Consider enabling this
      'prefer-template': 'off',
      'new-cap': 'off',
      'no-await-in-loop': 'off',
      'no-console': ['error', { allow: ['warn', 'error', 'table', 'trace'] }],
      'no-continue': 'off',
      'no-duplicate-imports': 'error',
      'no-else-return': 'off',
      'no-eq-null': 'off', // TODO: Consider enabling this
      'no-inline-comments': 'off',
      'no-loop-func': 'off',
      'no-nested-ternary': 'off',
      'no-magic-numbers': 'off',
      'no-param-reassign': 'off',
      'no-plusplus': 'off', // TODO: Consider enabling this
      'no-ternary': 'off',
      'no-underscore-dangle': 'off',
      'no-use-before-define': 'off',
      'no-warning-comments': 'off',
      'no-undef': 'off',
      'no-undef-init': 'off', // TODO: Consider enabling this
      'no-undefined': 'off',
      'no-unused-vars': 'off',
      'max-classes-per-file': 'off',
      'max-depth': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-params': 'off',
      'max-statements': 'off',
      radix: ['error', 'as-needed'],
      'require-atomic-updates': 'off',
      'require-await': 'off', // TODO: Consider enabling this
      'require-unicode-regexp': 'off',
      'sort-vars': 'off',

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
      'sort-keys': 'off',

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
        Object.keys(reactYouMightNotNeedAnEffect.configs.recommended.rules ?? {}).map(
          (ruleName) => [ruleName, 'error'],
        ),
      ),

      // Use the recommended rules for eslint-react as errors.
      ...Object.fromEntries(
        Object.entries(eslintReact.configs['recommended-typescript'].rules).map(
          ([ruleName, severity]) => [ruleName, severity === 'off' ? 'off' : 'error'],
        ),
      ),

      ...eslintPluginUnicorn.configs.recommended.rules,

      // These rules don't align with our own style guidelines
      'unicorn/filename-case': 'off', // We don't enforce specific styles for filenames
      'unicorn/no-anonymous-default-export': 'off', // We use this for all of our pages
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-array-method-this-argument': 'off',
      'unicorn/no-array-reduce': 'off', // Sometimes, an array reduce is more readable
      'unicorn/no-hex-escape': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-useless-undefined': 'off', // Explicit undefined is more readable than implicit undefined
      'unicorn/prefer-code-point': 'off',
      'unicorn/prefer-dom-node-dataset': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2261095992
      'unicorn/prefer-string-raw': 'off', // We don't use `String.raw` in our codebase
      'unicorn/prefer-ternary': 'off', // if/else can be more readable than a ternary
      'unicorn/prefer-top-level-await': 'off', // we use this on a lot of pages
      'unicorn/prefer-type-error': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/prefer-export-from': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2252265000
      'unicorn/no-lonely-if': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2252261293

      // These rules have many violations. Decisions about enabling the rules have been deferred.
      'unicorn/no-await-expression-member': 'off', // 400+ violations
      'unicorn/no-array-for-each': 'off', // 300+ violations
      'unicorn/catch-error-name': 'off', // 200+ violations
      'unicorn/switch-case-braces': 'off', // 200+ violations
      'unicorn/no-negated-condition': 'off', // 150+ violations
      'unicorn/prefer-global-this': 'off', // 150+ violations
      'unicorn/prefer-node-protocol': 'off', // 100+ violations

      // TODO: investigate, < 100 violations
      'unicorn/consistent-assert': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/escape-case': 'off',
      'unicorn/import-style': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/prefer-spread': 'off',
      'unicorn/prefer-switch': 'off',
      'unicorn/prefer-query-selector': 'off',
      'unicorn/text-encoding-identifier-case': 'off',

      // TODO: investigated and manual fixes are required
      'unicorn/no-object-as-default-parameter': 'off',
      'unicorn/prefer-event-target': 'off',
      'unicorn/prefer-dom-node-text-content': 'off',
      'unicorn/prefer-add-event-listener': 'off',

      // False positives
      'unicorn/error-message': 'off',
      'unicorn/throw-new-error': 'off',
      'unicorn/prefer-at': 'off', // https://github.com/microsoft/TypeScript/issues/47660#issuecomment-3146907649

      // Duplicated from other lint rules
      'unicorn/no-this-assignment': 'off',
      'unicorn/prefer-module': 'off',
      'unicorn/no-static-only-class': 'off',

      // https://github.com/PrairieLearn/PrairieLearn/pull/12545/files#r2252069292
      'unicorn/no-for-loop': 'off',

      // Conflicts with prettier
      'unicorn/template-indent': 'off',
      'unicorn/no-nested-ternary': 'off',
      'unicorn/number-literal-case': 'off',

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
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_RESTRICTED_SYNTAX,
        {
          selector: 'MemberExpression[object.name="module"][property.name="exports"]',
          message: 'module.exports should not be used in TypeScript files',
        },
      ],
      ...jsdoc.configs['flat/recommended-typescript-error'].rules,
      'jsdoc/check-line-alignment': 'error',
      'jsdoc/require-asterisk-prefix': 'error',
      'jsdoc/convert-to-jsdoc-comments': [
        'error',
        {
          enforceJsdocLineStyle: 'single',
          contexts: ['FunctionDeclaration', 'TSDeclareFunction'],
          contextsBeforeAndAfter: ['TSPropertySignature'],
          allowedPrefixes: ['@ts-', 'istanbul ', 'c8 ', 'v8 ', 'eslint', 'prettier-', 'global'],
        },
      ],
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-param': 'off',
      // Potential future rules:
      // 'jsdoc/informative-docs': ['error'],
      // 'jsdoc/require-hyphen-before-param-description': ['error', 'never'],
      'jsdoc/tag-lines': 'off',
    },
  },
  {
    files: ['**/*.js'],
    rules: {
      ...jsdoc.configs['flat/recommended-typescript-flavor-error'].rules,
      'jsdoc/require-param-description': 'off',
      'jsdoc/check-line-alignment': 'error',
      'jsdoc/require-asterisk-prefix': 'error',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/tag-lines': 'off',
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
    files: ['apps/prairielearn/src/tests/**/*', 'scripts/**/*', 'contrib/**/*'],
    rules: {
      'no-console': 'off',
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
