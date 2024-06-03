import path from 'node:path';

import yargsParser from 'yargs-parser';

import * as Sentry from '@prairielearn/sentry';

import { loadConfig, config } from './config.js';
import { REPOSITORY_ROOT_PATH, APP_ROOT_PATH } from './paths.js';

// For backwards compatibility, we'll default to trying to load config
// files from both the application and repository root.
//
// We'll put the app config file second so that it can override anything
// in the repository root config file.
let configPaths = [
  path.join(REPOSITORY_ROOT_PATH, 'config.json'),
  path.join(APP_ROOT_PATH, 'config.json'),
];

// If a config file was specified on the command line, we'll use that
// instead of the default locations.

const argv = yargsParser(process.argv.slice(2));
if ('config' in argv) {
  configPaths = [argv['config']];
}

await loadConfig(configPaths);

if (config.sentryDsn) {
  await Sentry.init({
    dsn: config.sentryDsn,
    environment: config.sentryEnvironment,
  });
}
