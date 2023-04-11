module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'no-floating-promise', 'no-only-tests', 'mocha'],
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

    // The recommended Mocha rules are too strict for us; we'll only enable
    // these two rules.
    'mocha/no-exclusive-tests': 'error',
    'mocha/no-skipped-tests': 'error',

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
  },
  overrides: [
    {
      files: ['*.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      files: ['*.test.{js,ts,mjs}'],
      env: {
        mocha: true,
      },
    },
    {
      files: ['assets/scripts/*.js'],
      env: {
        browser: true,
        jquery: true,
      },
    },
  ],
};
