// We support running our tests in two modes:
//
// - Directly against the source files in `src/`, in which case we use
// `ts-node` to transpile it on the fly. Useful for quick iteration during
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

module.exports = {
  require: [
    // Set up `TS_NODE_*` environment variables. This must be loaded before
    // `ts-node/register`. Environment variables are implemented here instead
    // of via `ENV=...` so that they're used even when executing Mocha directly,
    // e.g. `yarn mocha path/to/file.ts`.
    isRunningOnDist ? null : './src/tests/mocha-env.mjs',
    isRunningOnDist ? null : 'ts-node/register',
    isRunningOnDist ? './dist/tests/mocha-hooks.js' : './src/tests/mocha-hooks.ts',
  ].filter(Boolean),
  timeout: '30000', // in milliseconds
  'watch-files': ['.'],
};
