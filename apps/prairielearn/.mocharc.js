module.exports = {
  require: [
    // Set up `TS_NODE_*` environment variables. This must be loaded before
    // `ts-node/register`. Environment variables are implemented here instead
    // of via `ENV=...` so that they're used even when executing Mocha directly,
    // e.g. `yarn mocha path/to/file.ts`.
    './src/tests/mocha-env.mjs',
    'ts-node/register',
    './src/tests/mocha-hooks.ts',
  ],
  timeout: '30000', // in milliseconds
  'watch-files': ['.'],
};
