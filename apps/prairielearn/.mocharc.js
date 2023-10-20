module.exports = {
  require: ['tsx/cjs', './src/tests/mocha-hooks.ts'],
  timeout: '30000', // in milliseconds
  'watch-files': ['.'],
};
