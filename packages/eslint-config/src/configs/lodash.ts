import type { TSESLint } from '@typescript-eslint/utils';
import youDontNeedLodashUnderscore from 'eslint-plugin-you-dont-need-lodash-underscore';

const allRules = Object.fromEntries(
  Object.keys(youDontNeedLodashUnderscore.rules).map((rule) => [
    `you-dont-need-lodash-underscore/${rule}`,
    'error',
  ]),
);

/**
 * Lodash/underscore replacement rules.
 */
export function lodashConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      plugins: {
        'you-dont-need-lodash-underscore': youDontNeedLodashUnderscore,
      },
      rules: {
        ...allRules,
        // The _.omit function is still useful in some contexts.
        'you-dont-need-lodash-underscore/omit': 'off',
      },
    },
  ];
}
