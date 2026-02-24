import type { TSESLint } from '@typescript-eslint/utils';
import vitest from '@vitest/eslint-plugin';

/**
 * Vitest test framework rules.
 */
export function vitestConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      plugins: {
        vitest,
      },

      rules: {
        // Use the recommended rules for vitest
        ...vitest.configs.recommended.rules,

        // We are disabling the test for a reason.
        'vitest/no-disabled-tests': 'off',

        // This gives a lot of false positives; we sometimes author tests that
        // have the assertion in a helper function. We could refactor them in
        // the future, but for now we'll disable this rule.
        'vitest/expect-expect': 'off',

        // We violate this rule in a lot of places. We'll turn it off for now.
        'vitest/no-identical-title': 'off',
      },
    },
  ];
}
