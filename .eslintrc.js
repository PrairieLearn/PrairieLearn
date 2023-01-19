module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: ['eslint:recommended', 'plugin:import/recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 13,
  },
  plugins: ['no-floating-promise'],
  rules: {
    curly: ['error', 'multi-line', 'consistent'],
    eqeqeq: ['error', 'smart'],
    'no-floating-promise/no-floating-promise': 'error',
    'handle-callback-err': 'error',
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
  ],
};
