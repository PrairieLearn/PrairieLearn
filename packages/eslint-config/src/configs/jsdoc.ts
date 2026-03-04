import type { TSESLint } from '@typescript-eslint/utils';
import jsdoc from 'eslint-plugin-jsdoc';

/**
 * JSDoc documentation rules.
 */
export function jsdocConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      plugins: {
        jsdoc,
      },

      settings: {
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
      },
    },
    // TypeScript files
    {
      files: ['**/*.{ts,tsx}'],
      rules: {
        ...jsdoc.configs['flat/recommended-typescript-error'].rules,
        'jsdoc/check-line-alignment': 'error',
        'jsdoc/check-tag-names': ['error', { definedTags: ['knipignore'] }],
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
        'jsdoc/tag-lines': 'off',
      },
    },
    // JavaScript files
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
  ];
}
