import type { TSESLint } from '@typescript-eslint/utils';

/**
 * TypeScript-specific rules (non-type-aware).
 */
export function typescriptConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        // We use empty functions in quite a few places, so we'll disable this rule.
        '@typescript-eslint/no-empty-function': 'off',
        // Look, sometimes we just want to use `any`.
        '@typescript-eslint/no-explicit-any': 'off',
        // This was enabled when we upgraded to `@typescript-eslint/*` v6.
        '@typescript-eslint/no-dynamic-delete': 'off',
        // We use `!` to assert that a value is not `null` or `undefined`.
        '@typescript-eslint/no-non-null-assertion': 'off',
        // Replaces the standard `no-unused-vars` rule.
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            args: 'after-used',
            argsIgnorePattern: '^_', // Args can be _
            varsIgnorePattern: '^_.', // This includes lodash, which should be considered
          },
        ],
      },
    },
  ];
}

/**
 * Type-aware TypeScript rules.
 * These require a tsconfig.json to be configured.
 */
export function typescriptTypeAwareRules(): TSESLint.FlatConfig.Rules {
  return {
    '@typescript-eslint/no-base-to-string': 'off',
    '@typescript-eslint/no-invalid-void-type': [
      'error',
      {
        allowAsThisParameter: true,
      },
    ],
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    // Some functions are required to be async, but don't actually use any async code.
    '@typescript-eslint/require-await': 'off',
    // We don't always check that we got a error when a promise is rejected.
    '@typescript-eslint/no-misused-promises': [
      'error',
      {
        checksConditionals: true,
        checksSpreads: true,
        checksVoidReturn: {
          // Common usage with `async` functions
          arguments: false,
          // Common usage with `async` onClick handlers
          attributes: false,
          inheritedMethods: true,
          // Common usage with e.g. setState
          properties: false,
          returns: true,
          variables: true,
        },
      },
    ],
    '@typescript-eslint/no-unnecessary-condition': [
      'error',
      { allowConstantLoopConditions: 'only-allowed-literals' },
    ],
    '@typescript-eslint/only-throw-error': [
      'error',
      {
        allow: [
          {
            from: 'file',
            name: 'HttpRedirect',
          },
        ],
        allowRethrowing: true,
        allowThrowingAny: true,
        allowThrowingUnknown: true,
      },
    ],
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-promise-reject-errors': 'off',
    '@typescript-eslint/prefer-regexp-exec': 'off',
    '@typescript-eslint/restrict-template-expressions': [
      'error',
      {
        allow: [{ from: 'lib', name: ['Error', 'URL', 'URLSearchParams'] }],
        allowAny: true,
        allowBoolean: true,
        allowNullish: true,
        allowNumber: true,
        allowRegExp: true,
      },
    ],
  };
}
