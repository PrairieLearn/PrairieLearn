module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:@typescript-eslint/stylistic',
    'plugin:@typescript-eslint/strict',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'no-floating-promise', 'no-only-tests', 'mocha', '@prairielearn'],
  parserOptions: {
    ecmaVersion: 13,
  },
  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.js'],
    },
    'import/resolver': {
      typescript: true,
      node: true,
    },
  },
  rules: {
    curly: ['error', 'multi-line', 'consistent'],
    eqeqeq: ['error', 'smart'],
    'no-floating-promise/no-floating-promise': 'error',
    'no-only-tests/no-only-tests': 'error',
    'handle-callback-err': 'error',
    'no-template-curly-in-string': 'error',
    'no-restricted-syntax': [
      'error',
      {
        selector:
          'CallExpression[callee.type="MemberExpression"][callee.object.name="MathJax"][callee.property.name=/^(typeset|tex2chtml|tex2svg)$/]',
        message:
          "Don't use the synchronous MathJax API; use a function like typesetPromise() instead.",
      },
      {
        selector: 'MemberExpression[object.name="MathJax"][property.name="Hub"]',
        message: 'Use MathJax.typesetPromise() instead of MathJax.Hub',
      },
    ],
    'object-shorthand': 'error',

    // This isn't super useful to use because we're using TypeScript.
    'import/no-named-as-default-member': 'off',

    // By default, eslint-plugin-import only validates ESM syntax. We're still
    // using CommonJS, so we need to explicitly enable support for that.
    'import/no-unresolved': [
      2,
      {
        commonjs: true,
      },
    ],

    // This gives false positives for `fs-extra`, which re-exports everything
    // from `fs`. We'll disable it for now.
    //
    // TODO: file an issue upstream with `eslint-plugin-import`.
    'import/namespace': 'off',

    // The recommended Mocha rules are too strict for us; we'll only enable
    // these two rules.
    'mocha/no-exclusive-tests': 'error',
    'mocha/no-skipped-tests': 'error',

    // These rules are implemented in `packages/eslint-plugin-prairielearn`.
    '@prairielearn/aws-client-mandatory-config': 'error',
    '@prairielearn/aws-client-shared-config': 'error',

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
  },
  overrides: [
    {
      files: ['*.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      files: ['*.ts'],
      rules: {
        // TypeScript performs similar checks, so we disable these for TS files.
        // https://typescript-eslint.io/linting/troubleshooting/performance-troubleshooting/#eslint-plugin-import
        'import/named': 'off',
        'import/namespace': 'off',
        'import/default': 'off',
        'import/no-named-as-default-member': 'off',
        'no-restricted-syntax': [
          'error',
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
