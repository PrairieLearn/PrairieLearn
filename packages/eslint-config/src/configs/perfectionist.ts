import type { TSESLint } from '@typescript-eslint/utils';
import perfectionist from 'eslint-plugin-perfectionist';

/**
 * Perfectionist sorting rules.
 * Most rules are off by default but pre-configured for convenient inline enabling.
 * `sort-jsx-props` is enabled by default with callback grouping.
 */
export function perfectionistConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      plugins: {
        perfectionist,
      },

      rules: {
        // Configure all perfectionist rules to be off by default but with options preset
        ...Object.fromEntries(
          Object.keys(perfectionist.rules ?? {}).map((ruleName) => [
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

        // Enable sort-jsx-props with callback grouping
        'perfectionist/sort-jsx-props': [
          'error',
          {
            customGroups: [
              { elementNamePattern: '^on[A-Z]', groupName: 'callback' },
              { elementNamePattern: '^(key|ref)$', groupName: 'reserved' },
            ],
            groups: ['reserved', 'unknown', 'shorthand-prop', 'callback'],
            ignoreCase: true,
            type: 'unsorted',
          },
        ],
      },
    },
  ];
}
