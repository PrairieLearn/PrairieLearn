import { FlatCompat } from '@eslint/eslintrc';
import type { TSESLint } from '@typescript-eslint/utils';
import youDontNeedLodashUnderscore from 'eslint-plugin-you-dont-need-lodash-underscore';

const compat = new FlatCompat();

/**
 * Lodash/underscore replacement rules.
 */
export function lodashConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      plugins: {
        'you-dont-need-lodash-underscore': youDontNeedLodashUnderscore,
      },
    },
    // Use FlatCompat to extend the legacy config
    ...compat.extends('plugin:you-dont-need-lodash-underscore/all'),
    {
      rules: {
        // The _.omit function is still useful in some contexts.
        'you-dont-need-lodash-underscore/omit': 'off',
      },
    },
  ];
}
