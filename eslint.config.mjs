/* eslint perfectionist/sort-objects: error */
// @ts-check
import path from 'path';

import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import html from '@html-eslint/eslint-plugin';
import htmlParser from '@html-eslint/parser';
import stylistic from '@stylistic/eslint-plugin';
import pluginQuery from '@tanstack/eslint-plugin-query';
import vitest from '@vitest/eslint-plugin';
import { globalIgnores } from 'eslint/config';
import importX from 'eslint-plugin-import-x';
import jsdoc from 'eslint-plugin-jsdoc';
import jsxA11yX from 'eslint-plugin-jsx-a11y-x';
import noFloatingPromise from 'eslint-plugin-no-floating-promise';
import perfectionist from 'eslint-plugin-perfectionist';
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
    message: "Don't use the synchronous MathJax API; use a function like typesetPromise() instead.",
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.object.name="MathJax"][callee.property.name=/^(typeset|tex2chtml|tex2svg)$/]',
  },
  {
    message: 'Use MathJax.typesetPromise() instead of MathJax.Hub',
    selector: 'MemberExpression[object.name="MathJax"][property.name="Hub"]',
  },
  {
    message: 'Use a default import instead of a namespace import for fs-extra',
    selector: 'ImportDeclaration[source.value="fs-extra"]:has(ImportNamespaceSpecifier)',
  },
];

export default tseslint.config([
  tseslint.configs.stylistic,
  tseslint.configs.strict,
  {
    plugins: {
      '@html-eslint': html,
    },
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
          disallowInAssignment: true,
          disallowMissing: true,
          disallowTabs: true,
          enforceBeforeSelfClose: true,
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
  },
  {
    extends: compat.extends('plugin:you-dont-need-lodash-underscore/all'),
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],

    languageOptions: {
      globals: { ...globals.node },
    },

    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },

    plugins: {
      'import-x': importX,
      jsdoc,
      'jsx-a11y-x': jsxA11yX,
      'no-floating-promise': noFloatingPromise,
      'react-hooks': reactHooks,
      'react-you-might-not-need-an-effect': reactYouMightNotNeedAnEffect,
      vitest,
      'you-dont-need-lodash-underscore': youDontNeedLodashUnderscore,
      ...eslintReact.configs['recommended-typescript'].plugins,
      '@html-eslint': html,
      '@prairielearn': prairielearn,
      '@stylistic': stylistic,
      '@tanstack/query': pluginQuery,
      perfectionist,
      unicorn: eslintPluginUnicorn,
    },

    rules: {
      ...js.configs.all.rules,
      'array-callback-return': 'off',
      'arrow-body-style': 'off', // TODO: Consider enabling this
      camelcase: 'off',
      'capitalized-comments': 'off',
      'class-methods-use-this': 'off',
      complexity: 'off',
      'consistent-return': 'off', // TODO: Consider enabling this
      'consistent-this': 'off',
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
      'max-classes-per-file': 'off',
      'max-depth': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-params': 'off',
      'max-statements': 'off',
      'new-cap': 'off',
      'no-await-in-loop': 'off',
      'no-bitwise': 'off',
      'no-console': ['error', { allow: ['warn', 'error', 'table', 'trace'] }],
      'no-continue': 'off',
      'no-duplicate-imports': 'error',
      'no-else-return': 'off',
      'no-empty-function': 'off', // TODO: Consider enabling this
      'no-eq-null': 'off', // TODO: Consider enabling this
      'no-implicit-coercion': 'off', // TODO: Consider enabling this
      'no-inline-comments': 'off',
      'no-invalid-this': 'off', // TODO: Consider enabling this
      'no-lonely-if': 'off', // TODO: Consider enabling this
      'no-loop-func': 'off',
      'no-magic-numbers': 'off',
      'no-negated-condition': 'off',
      'no-nested-ternary': 'off',
      'no-new': 'off', // TODO: Consider enabling this
      'no-param-reassign': 'off',
      'no-plusplus': 'off', // TODO: Consider enabling this
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
      'no-template-curly-in-string': 'error',
      'no-ternary': 'off',
      'no-undef': 'off',
      'no-undef-init': 'off', // TODO: Consider enabling this
      'no-undefined': 'off',
      'no-underscore-dangle': 'off',
      'no-unmodified-loop-condition': 'off',
      'no-unneeded-ternary': 'off', // TODO: Consider enabling this
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',
      'no-useless-assignment': 'off', // TODO: Consider enabling this
      'no-useless-concat': 'off', // TODO: Consider enabling this
      'no-useless-constructor': 'off',
      'no-useless-return': 'off', // TODO: Consider enabling this
      'no-void': 'off', // https://typescript-eslint.io/rules/no-floating-promises/#ignorevoid
      'no-warning-comments': 'off',
      'object-shorthand': 'error',
      'one-var': ['off', 'never'], // TODO: Consider enabling this
      'prefer-arrow-callback': 'off',
      'prefer-const': ['error', { destructuring: 'all' }],
      'prefer-destructuring': 'off', // TODO: Consider enabling this
      'prefer-named-capture-group': 'off',
      'prefer-object-has-own': 'off', // TODO: Consider enabling this
      'prefer-template': 'off',
      radix: ['error', 'as-needed'],
      'require-atomic-updates': 'off',
      'require-await': 'off', // TODO: Consider enabling this
      'require-unicode-regexp': 'off',

      'sort-vars': 'off',

      // Enforce alphabetical order of import specifiers within each import group.
      // The import-x/order rule handles the overall sorting of the import groups.
      'import-x/order': [
        'error',
        {
          alphabetize: {
            order: 'asc',
          },

          'newlines-between': 'always',

          pathGroups: [
            {
              group: 'external',
              pattern: '@prairielearn/**',
              position: 'after',
            },
          ],

          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],
      'no-floating-promise/no-floating-promise': 'error',

      'sort-imports': [
        'error',
        {
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        },
      ],

      'sort-keys': 'off',

      // Enable all jsx-a11y rules.
      ...jsxA11yX.configs.strict.rules,
      'jsx-a11y-x/anchor-ambiguous-text': 'error',
      'jsx-a11y-x/lang': 'error',
      'jsx-a11y-x/no-aria-hidden-on-focusable': 'error',
      // Bootstrap turns some elements into interactive elements.
      'jsx-a11y-x/no-noninteractive-element-to-interactive-role': [
        'error',
        {
          li: ['menuitem', 'option', 'row', 'tab', 'treeitem'],
          ol: ['listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid'],
          table: ['grid'],
          td: ['gridcell'],
          ul: ['listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid', 'role'],
        },
      ],

      ...Object.fromEntries(
        Object.keys(perfectionist.rules).map((ruleName) => [
          'perfectionist/' + ruleName,
          [
            // Configure the options for every rule, to make inline usage more convenient.
            'off',
            // These rules don't have a comment partition
            ['sort-heritage-clauses', 'sort-jsx-props', 'sort-switch-case'].includes(ruleName)
              ? { type: 'natural' }
              : { partitionByComment: true, type: 'natural' },
          ],
        ]),
      ),

      // Use the recommended rules for react-hooks
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',

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
      '@eslint-react/no-forbidden-props': [
        'error',
        {
          forbid: ['className', 'htmlFor', '/_/'],
        },
      ],

      ...eslintPluginUnicorn.configs.recommended.rules,

      // These rules don't align with our own style guidelines
      'unicorn/filename-case': 'off', // We don't enforce specific styles for filenames
      'unicorn/no-anonymous-default-export': 'off', // We use this for all of our pages
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-array-method-this-argument': 'off',
      'unicorn/no-array-reduce': 'off', // Sometimes, an array reduce is more readable
      'unicorn/no-hex-escape': 'off',
      'unicorn/no-lonely-if': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2252261293
      'unicorn/no-null': 'off',
      'unicorn/no-useless-undefined': 'off', // Explicit undefined is more readable than implicit undefined
      'unicorn/prefer-code-point': 'off',
      'unicorn/prefer-dom-node-dataset': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2261095992
      'unicorn/prefer-export-from': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2252265000
      'unicorn/prefer-string-raw': 'off', // We don't use `String.raw` in our codebase
      'unicorn/prefer-ternary': 'off', // if/else can be more readable than a ternary
      'unicorn/prefer-top-level-await': 'off', // we use this on a lot of pages
      'unicorn/prefer-type-error': 'off',
      'unicorn/prevent-abbreviations': 'off',

      // These rules have many violations. Decisions about enabling the rules have been deferred.
      'unicorn/catch-error-name': 'off', // 200+ violations
      'unicorn/no-array-for-each': 'off', // 300+ violations
      'unicorn/no-await-expression-member': 'off', // 400+ violations
      'unicorn/no-negated-condition': 'off', // 150+ violations
      'unicorn/prefer-global-this': 'off', // 150+ violations
      'unicorn/prefer-node-protocol': 'off', // 100+ violations
      'unicorn/switch-case-braces': 'off', // 200+ violations

      // TODO: investigate, < 100 violations
      'unicorn/consistent-assert': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/escape-case': 'off',
      'unicorn/import-style': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/prefer-query-selector': 'off',
      'unicorn/prefer-spread': 'off',
      'unicorn/prefer-switch': 'off',
      'unicorn/text-encoding-identifier-case': 'off',

      // TODO: investigated and manual fixes are required
      'unicorn/no-object-as-default-parameter': 'off',
      'unicorn/prefer-add-event-listener': 'off',
      'unicorn/prefer-dom-node-text-content': 'off',
      'unicorn/prefer-event-target': 'off',

      // False positives
      'unicorn/error-message': 'off',
      'unicorn/prefer-at': 'off', // https://github.com/microsoft/TypeScript/issues/47660#issuecomment-3146907649
      'unicorn/throw-new-error': 'off',

      // Duplicated from other lint rules
      'unicorn/no-static-only-class': 'off',
      'unicorn/no-this-assignment': 'off',
      'unicorn/prefer-module': 'off',

      // https://github.com/PrairieLearn/PrairieLearn/pull/12545/files#r2252069292
      'unicorn/no-for-loop': 'off',

      // Conflicts with prettier
      'unicorn/no-nested-ternary': 'off',
      'unicorn/number-literal-case': 'off',
      'unicorn/template-indent': 'off',

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

      '@stylistic/jsx-curly-brace-presence': [
        'error',
        { children: 'never', propElementValues: 'always', props: 'never' },
      ],

      '@stylistic/jsx-self-closing-comp': [
        'error',
        {
          component: true,
          html: true,
        },
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
      '@stylistic/jsx-tag-spacing': [
        'error',
        {
          afterOpening: 'never',
          beforeClosing: 'allow',
          beforeSelfClosing: 'always',
          closingSlash: 'never',
        },
      ],
      '@stylistic/lines-between-class-members': [
        'error',
        'always',
        { exceptAfterSingleLine: true },
      ],
      '@stylistic/no-tabs': 'error',
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', next: 'function', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'import' },
        { blankLine: 'any', next: 'import', prev: 'import' },
      ],
      // Blocks double-quote strings (unless a single quote is present in the
      // string) and backticks (unless there is a tag or substitution in place).
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],

      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // We use empty functions in quite a few places, so we'll disable this rule.
      '@typescript-eslint/no-empty-function': 'off',
      // Look, sometimes we just want to use `any`.
      '@typescript-eslint/no-explicit-any': 'off',
      // This was enabled when we upgraded to `@typescript-eslint/*` v6.
      // TODO: fix the violations so we can enable this rule.
      '@typescript-eslint/no-dynamic-delete': 'off',
      // We use `!` to assert that a value is not `null` or `undefined`.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Replaces the standard `no-unused-vars` rule.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_', // Args can be _
          varsIgnorePattern: '^_.', // This includes lodash, which should be considered
        },
      ],

      // https://github.com/TanStack/query/blob/6402d756b702ac560b69a5ce84d6e4e764b96451/packages/eslint-plugin-query/src/index.ts#L43
      ...pluginQuery.configs['flat/recommended'][0].rules,
      '@tanstack/query/no-rest-destructuring': 'error',

      // The _.omit function is still useful in some contexts.
      'you-dont-need-lodash-underscore/omit': 'off',
    },

    settings: {
      'import-x/parsers': {
        '@typescript-eslint/parser': ['.ts', '.js'],
      },
      'import-x/resolver': {
        node: true,
        typescript: true,
      },
      jsdoc: {
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
        exemptDestructuredRootsFromChecks: true,
      },

      'jsx-a11y-x': {
        attributes: {
          for: ['for'],
        },
      },

      ...eslintReact.configs['recommended-typescript'].settings,
      'react-x': {
        ...eslintReact.configs['recommended-typescript'].settings['react-x'],
        // This is roughly the version that Preact's compat layer supports.
        version: '18.0.0',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_RESTRICTED_SYNTAX,
        {
          message: 'module.exports should not be used in TypeScript files',
          selector: 'MemberExpression[object.name="module"][property.name="exports"]',
        },
      ],
      ...jsdoc.configs['flat/recommended-typescript-error'].rules,
      'jsdoc/check-line-alignment': 'error',
      'jsdoc/convert-to-jsdoc-comments': [
        'error',
        {
          allowedPrefixes: ['@ts-', 'istanbul ', 'c8 ', 'v8 ', 'eslint', 'prettier-', 'global'],
          contexts: ['FunctionDeclaration', 'TSDeclareFunction'],
          contextsBeforeAndAfter: ['TSPropertySignature'],
          enforceJsdocLineStyle: 'single',
        },
      ],
      'jsdoc/require-asterisk-prefix': 'error',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
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
      'jsdoc/check-line-alignment': 'error',
      'jsdoc/require-asterisk-prefix': 'error',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },
  {
    // We only include apps/prairielearn for performance reasons.
    extends: [
      tseslint.configs.recommendedTypeCheckedOnly,
      tseslint.configs.stylisticTypeCheckedOnly,
    ],
    files: ['apps/prairielearn/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['vite.config.ts', 'vitest.config.ts'],
        },
        tsconfigRootDir: path.join(import.meta.dirname, 'apps', 'prairielearn'),
      },
    },
    rules: {
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-invalid-void-type': [
        'error',
        {
          allowAsThisParameter: true,
        },
      ],
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Some functions are required to be async, but don't actually use any async code.
      '@typescript-eslint/require-await': 'off',
      // We don't always check that we got a error when a promise is rejected.
      '@typescript-eslint/no-misused-promises': [
        'error',

        {
          checksConditionals: true,
          checksSpreads: true,
          checksVoidReturn: {
            // Common usage with `async` functions
            arguments: false,
            // Common usage with `async` onClick handlers
            attributes: false,
            inheritedMethods: true,
            // Common usage with e.g. setState
            properties: false,
            returns: true,
            variables: true,
          },
        },
      ],
      '@typescript-eslint/no-unnecessary-condition': [
        'error',
        { allowConstantLoopConditions: 'only-allowed-literals' },
      ],
      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [
            {
              from: 'file',
              name: 'HttpRedirect',
            },
          ],
          allowRethrowing: true,
          allowThrowingAny: true,
          allowThrowingUnknown: true,
        },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': 'off', // TODO: enable
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allow: [{ from: 'lib', name: ['Error', 'URL', 'URLSearchParams'] }],
          allowAny: true,
          allowBoolean: true,
          allowNullish: true,
          allowNumber: true,
          allowRegExp: true,
        },
      ],
    },
  },
  {
    // TODO: enable this rule for all files.
    files: [
      'apps/prairielearn/src/middlewares/**/*.ts',
      'apps/prairielearn/assets/scripts/**/*.ts',
      'apps/prairielearn/*.config.ts',
    ],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
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
    languageOptions: {
      parser: htmlParser,
      parserOptions: {
        templateEngineSyntax: htmlParser.TEMPLATE_ENGINE_SYNTAX.HANDLEBAR,
      },
    },
    rules: {
      '@html-eslint/no-extra-spacing-text': 'off',
      // We prefer tags like `<img>` over `<img />`.
      '@html-eslint/require-closing-tags': ['error', { selfClosing: 'never' }],
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
