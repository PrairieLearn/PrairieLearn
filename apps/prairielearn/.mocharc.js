module.exports = {
  require: ['./src/tests/mocha-env.mjs', 'ts-node/register', './src/tests/mocha-hooks.mjs'],
  timeout: '30000', // in milliseconds
  'watch-files': ['.'],
};
