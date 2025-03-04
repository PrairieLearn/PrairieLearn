const NO_RESTRICTED_SYNTAX = [
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.object.name="MathJax"][callee.property.name=/^(typeset|tex2chtml|tex2svg)$/]',
    message: "Don't use the synchronous MathJax API; use a function like typesetPromise() instead.",
  },
  {
    selector: 'MemberExpression[object.name="MathJax"][property.name="Hub"]',
    message: 'Use MathJax.typesetPromise() instead of MathJax.Hub',
  },
  {
    selector: 'ImportDeclaration[source.value="fs-extra"]:has(ImportNamespaceSpecifier)',
    message: 'Use a default import instead of a namespace import for fs-extra',
  },
];

module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@eslint-react/recommended-legacy',
    'plugin:@typescript-eslint/stylistic',
    'plugin:@typescript-eslint/strict',
    'prettier',
  ],
  plugins: [
    'import-x',
    'mocha',
    'no-floating-promise',
    'no-only-tests',
    '@eslint-react',
    '@prairielearn',
    '@typescript-eslint',
  ],
  parserOptions: {
    ecmaVersion: 13,
  },
  settings: {
    'import-x/parsers': {
      '@typescript-eslint/parser': ['.ts', '.js'],
    },
    'import-x/resolver': {
      typescript: true,
      node: true,
    },
    react: {
      pragma: 'h',
    },
  },
  reportUnusedDisableDirectives: true,
  rules: {
    curly: ['error', 'multi-line', 'consistent'],
    eqeqeq: ['error', 'smart'],
    'no-floating-promise/no-floating-promise': 'error',
    'no-only-tests/no-only-tests': 'error',
    'handle-callback-err': 'error',
    'no-template-curly-in-string': 'error',
    'no-restricted-globals': [
      'error',
      // These are not available in ES modules.
      '__filename',
      '__dirname',
    ],
    'no-restricted-syntax': ['error', ...NO_RESTRICTED_SYNTAX],
    'object-shorthand': 'error',

    'import-x/order': [
      'error',
      {
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
        },
        pathGroups: [
          {
            pattern: '@prairielearn/**',
            group: 'external',
            position: 'after',
          },
        ],
        pathGroupsExcludedImportTypes: ['builtin'],
      },
    ],

    // The recommended Mocha rules are too strict for us; we'll only enable
    // these two rules.
    'mocha/no-exclusive-tests': 'error',
    'mocha/no-skipped-tests': 'error',

    // These rules are implemented in `packages/eslint-plugin-prairielearn`.
    '@prairielearn/aws-client-mandatory-config': 'error',
    '@prairielearn/aws-client-shared-config': 'error',

    '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],

    // Replaces the standard `no-unused-vars` rule.
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],

    // We use empty functions in quite a few places, so we'll disable this rule.
    '@typescript-eslint/no-empty-function': 'off',

    // Look, sometimes we just want to use `any`.
    '@typescript-eslint/no-explicit-any': 'off',

    // This was enabled when we upgraded to `@typescript-eslint/*` v6.
    // TODO: fix the violations so we can enable this rule.
    '@typescript-eslint/no-dynamic-delete': 'off',

    // Blocks double-quote strings (unless a single quote is present in the
    // string) and backticks (unless there is a tag or substitution in place).
    quotes: ['error', 'single', { avoidEscape: true }],
  },
  overrides: [
    {
      files: ['*.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          ...NO_RESTRICTED_SYNTAX,
          {
            selector: 'MemberExpression[object.name="module"][property.name="exports"]',
            message: 'module.exports should not be used in TypeScript files',
          },
        ],
      },
    },
    {
      files: ['*.test.{js,ts,mjs}'],
      env: {
        mocha: true,
      },
    },
    {
      files: ['apps/prairielearn/assets/scripts/**/*'],
      env: {
        browser: true,
        jquery: true,
      },
    },
  ],
};
