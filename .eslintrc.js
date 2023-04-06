module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 13,
  },
  plugins: ['no-floating-promise', 'mocha'],
  rules: {
    curly: ['error', 'multi-line', 'consistent'],
    eqeqeq: ['error', 'smart'],
    'no-floating-promise/no-floating-promise': 'error',
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
    'no-unused-vars': [
      'error',
      {
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],

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
  },
  overrides: [
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
    {
      files: ['packages/**/*.{js,ts,mjs}'],
    },
  ],
};
