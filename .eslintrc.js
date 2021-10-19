module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
    'handle-callback-err': 'error',
    'no-unused-vars': [
      'error',
      { args: 'after-used', argsIgnorePattern: '^_' },
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
};
