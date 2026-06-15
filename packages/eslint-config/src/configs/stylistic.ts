import stylistic from '@stylistic/eslint-plugin';
import type { TSESLint } from '@typescript-eslint/utils';

/**
 * Stylistic formatting rules.
 */
export function stylisticConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      plugins: {
        '@stylistic': stylistic,
      },

      rules: {
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
      },
    },
  ];
}
