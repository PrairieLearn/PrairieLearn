module.exports = {
  require: ['tsx', './src/tests/mocha-hooks.ts'],
  timeout: '30000', // in milliseconds
  'watch-files': ['.'],
};
