import path from 'node:path';

import { nodeProfilingIntegration } from '@sentry/profiling-node';
import yargsParser from 'yargs-parser';

import * as Sentry from '@prairielearn/sentry';

import { loadConfig, config } from './config.js';
import { REPOSITORY_ROOT_PATH, APP_ROOT_PATH } from './paths.js';

const argv = yargsParser(process.argv.slice(2));

if ('h' in argv || 'help' in argv) {
  const msg = `PrairieLearn command line options:
    -h, --help                          Display this help and exit
    --config <filename>
    <filename> and no other args        Load an alternative config filename
    --migrate-and-exit                  Run the DB initialization parts and exit
    --refresh-workspace-hosts-and-exit  Refresh the workspace hosts and exit
    --sync-course <course_id>           Synchronize a course and exit
`;

  console.log(msg);
  process.exit(0);
}

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
if ('config' in argv) {
  configPaths = [argv['config']];
}

// Load config immediately so we can use it configure everything else.
await loadConfig(configPaths);

if (config.sentryDsn) {
  const integrations: any = [Sentry.expressIntegration()];
  if (config.sentryTracesSampleRate && config.sentryProfilesSampleRate) {
    integrations.push(nodeProfilingIntegration());
  }

  await Sentry.init({
    dsn: config.sentryDsn,
    environment: config.sentryEnvironment,
    integrations,
    tracesSampleRate: config.sentryTracesSampleRate ?? undefined,
    // This is relative to `tracesSampleRate`.
    profilesSampleRate: config.sentryProfilesSampleRate ?? undefined,
    beforeSend: (event) => {
      // This will be necessary until we can consume the following change:
      // https://github.com/chimurai/http-proxy-middleware/pull/823
      //
      // The following error message should match the error that's thrown
      // from the `router` function in our `http-proxy-middleware` config.
      if (
        event.exception?.values?.some(
          (value) => value.type === 'Error' && value.value === 'Workspace is not running',
        )
      ) {
        return null;
      }

      return event;
    },
  });
}
