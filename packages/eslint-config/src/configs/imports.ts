import type { TSESLint } from '@typescript-eslint/utils';
import importX from 'eslint-plugin-import-x';

/**
 * Import ordering and resolution rules.
 */
export function importsConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      plugins: {
        'import-x': importX,
      },

      rules: {
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
      },

      settings: {
        'import-x/parsers': {
          '@typescript-eslint/parser': ['.ts', '.js'],
        },
        'import-x/resolver': {
          node: true,
          typescript: true,
        },
      },
    },
  ];
}
