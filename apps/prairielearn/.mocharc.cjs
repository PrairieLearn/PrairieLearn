// We support running our tests in two modes:
//
// - Directly against the source files in `src/`, in which case we use
// `tsx` to transpile it on the fly. Useful for quick iteration during
// development.
//
// - Against the compiled files in `dist/`, in which case we use the compiled
// files directly without compilation. This is useful for CI and for ensuring
// that the code that will actually run in production is tested.
//
// We use the presence of any arguments starting with `dist/` or containing
// `/dist/` to determine whether we're running in the latter mode.
const isRunningOnDist = process.argv
  .slice(2)
  .some((arg) => arg.startsWith('dist/') || arg.includes('/dist/'));

// We need to point to this `tsconfig.json` specifically to pick up the
// `allowJs: true` option.
process.env.TSX_TSCONFIG_PATH = './src/tsconfig.json';

module.exports = {
  'node-option': [
    'import=tsx/esm',
    // Silence the warning that we get from using the above option.
    'no-warnings',
  ],
  require: [isRunningOnDist ? './dist/tests/mocha-hooks.js' : './src/tests/mocha-hooks.ts'].filter(
    Boolean,
  ),
  timeout: '30000', // in milliseconds
  'watch-files': ['.'],
};
