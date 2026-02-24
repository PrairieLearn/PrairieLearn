import type { TSESLint } from '@typescript-eslint/utils';

import prairielearn from '@prairielearn/eslint-plugin';

export interface PrairieLearnPluginOptions {
  /**
   * Types to allow when using the safe-db-types rule.
   */
  allowDbTypes?: string[];
}

/**
 * PrairieLearn-specific ESLint plugin rules.
 * Includes AWS client configuration, JSX safety, SQL blocks, and database type safety.
 */
export function prairieLearnConfig(
  options?: PrairieLearnPluginOptions,
): TSESLint.FlatConfig.ConfigArray {
  const { allowDbTypes = [] } = options ?? {};

  return [
    {
      plugins: {
        '@prairielearn': prairielearn,
      },

      rules: {
        '@prairielearn/aws-client-mandatory-config': 'error',
        '@prairielearn/aws-client-shared-config': 'error',
        '@prairielearn/jsx-no-dollar-interpolation': 'error',
        '@prairielearn/no-current-target-in-callback': 'error',
        '@prairielearn/no-unused-sql-blocks': 'error',
        '@prairielearn/safe-db-types': [
          'error',
          {
            allowDbTypes,
          },
        ],
      },
    },
  ];
}
