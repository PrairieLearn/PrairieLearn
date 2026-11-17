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
        '@prairielearn/no-hydrate-reslocals': 'error',
        '@prairielearn/no-unused-sql-blocks': 'error',
        '@prairielearn/safe-db-types': [
          'error',
          {
            allowDbTypes,
          },
        ],
      },
    },
    // PrairieLearn elements (e.g., <pl-sketch-tool id="fd">) treat `id` as an
    // element-scoped identifier, not a DOM id, so `@html-eslint/no-duplicate-id`
    // produces false positives.
    {
      rules: {
        '@html-eslint/no-duplicate-id': 'off',
        '@prairielearn/html-no-duplicate-id': 'error',
      },
    },
    {
      files: ['**/src/trpc/**/*.ts'],
      rules: {
        '@prairielearn/require-trpc-permission-middleware': 'error',
      },
    },
  ];
}
