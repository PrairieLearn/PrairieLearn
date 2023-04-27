// Note that Mocha will recursively search upwards to look for a config file.
// If you're adding an invocation of Mocha to a subdirectory, consider using
// the `--no-config` flag to avoid this root config being used.
module.exports = {
  require: ['ts-node/register', './tests/mocha-hooks.mjs'],
  timeout: '30000', // in milliseconds
  'watch-files': ['.'],
};
