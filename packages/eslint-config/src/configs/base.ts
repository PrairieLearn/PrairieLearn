import js from '@eslint/js';
import type { TSESLint } from '@typescript-eslint/utils';
import noFloatingPromise from 'eslint-plugin-no-floating-promise';
import globals from 'globals';

/**
 * Base JavaScript/TypeScript configuration.
 * Core rules that apply to all JS/TS files.
 */
export function baseConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      languageOptions: {
        globals: { ...globals.node },
      },

      linterOptions: {
        reportUnusedDisableDirectives: 'error',
      },

      plugins: {
        'no-floating-promise': noFloatingPromise,
      },

      rules: {
        ...js.configs.all.rules,
        'array-callback-return': 'off',
        'arrow-body-style': 'off',
        camelcase: 'off',
        'capitalized-comments': 'off',
        'class-methods-use-this': 'off',
        complexity: 'off',
        'consistent-return': 'off',
        'consistent-this': 'off',
        curly: ['error', 'multi-line', 'consistent'],
        'default-case': 'off',
        'dot-notation': 'off',
        eqeqeq: ['error', 'smart'],
        'func-names': 'off',
        'func-style': 'off',
        'guard-for-in': 'off',
        'handle-callback-err': 'error',
        'id-length': 'off',
        'init-declarations': 'off',
        'logical-assignment-operators': 'off',
        'max-classes-per-file': 'off',
        'max-depth': 'off',
        'max-lines': 'off',
        'max-lines-per-function': 'off',
        'max-params': ['error', { max: 6 }],
        'max-statements': 'off',
        'new-cap': 'off',
        'no-await-in-loop': 'off',
        'no-bitwise': 'off',
        'no-console': ['error', { allow: ['warn', 'error', 'table', 'trace'] }],
        'no-continue': 'off',
        'no-duplicate-imports': 'error',
        'no-else-return': 'off',
        'no-empty-function': 'off',
        'no-eq-null': 'off',
        'no-implicit-coercion': 'off',
        'no-inline-comments': 'off',
        'no-invalid-this': 'off',
        'no-lonely-if': 'off',
        'no-loop-func': 'off',
        'no-magic-numbers': 'off',
        'no-negated-condition': 'off',
        'no-nested-ternary': 'off',
        'no-new': 'off',
        'no-param-reassign': 'off',
        'no-plusplus': 'off',
        'no-promise-executor-return': 'off',
        'no-redeclare': 'off',
        'no-restricted-globals': [
          'error',
          // These are not available in ES modules.
          '__filename',
          '__dirname',
        ],
        'no-shadow': 'off',
        'no-template-curly-in-string': 'error',
        'no-ternary': 'off',
        'no-undef': 'off',
        'no-undef-init': 'off',
        'no-undefined': 'off',
        'no-underscore-dangle': 'off',
        'no-unmodified-loop-condition': 'off',
        'no-unneeded-ternary': 'off',
        'no-unused-vars': 'off',
        'no-use-before-define': 'off',
        'no-useless-assignment': 'off',
        'no-useless-concat': 'off',
        'no-useless-constructor': 'off',
        'no-useless-return': 'off',
        'no-void': 'off', // https://typescript-eslint.io/rules/no-floating-promises/#ignorevoid
        'no-warning-comments': 'off',
        'object-shorthand': 'error',
        'one-var': ['off', 'never'],
        'prefer-arrow-callback': 'off',
        'prefer-const': ['error', { destructuring: 'all' }],
        'prefer-destructuring': 'off',
        'prefer-named-capture-group': 'off',
        'prefer-object-has-own': 'off',
        'prefer-template': 'off',
        radix: ['error', 'as-needed'],
        'require-atomic-updates': 'off',
        'require-await': 'off',
        'require-unicode-regexp': 'off',
        'sort-vars': 'off',
        'sort-keys': 'off',

        // Floating promise detection
        'no-floating-promise/no-floating-promise': 'error',

        // Sort imports within a single import statement
        'sort-imports': [
          'error',
          {
            ignoreDeclarationSort: true,
            ignoreMemberSort: false,
            memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
          },
        ],
      },
    },
  ];
}
