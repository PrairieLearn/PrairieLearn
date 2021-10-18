module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: ['eslint:recommended', 'plugin:import/recommended'],
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
    'comma-dangle': ['error', 'always-multiline'],
    'eqeqeq': ['error', 'smart'],
    'handle-callback-err': 'error',
    'no-tabs': 'error',
    'no-unused-vars': [
      'error',
      { args: 'after-used', argsIgnorePattern: '^_' },
    ],
    quotes: [
      'error',
      'single',
      { avoidEscape: true, allowTemplateLiterals: true },
    ],
    semi: ['error', 'always'],

    // By default, eslint-plugin-import only validates ESM syntax. We're still
    // using CommonJS, so we need to explicitly enable support for that.
    'import/no-unresolved': [
      2,
      {
        commonjs: true,
      },
    ],
  },
};
