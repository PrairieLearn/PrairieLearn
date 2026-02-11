import tmp from 'tmp-promise';

import { closeSql, createTemplate } from './helperDb.js';

export async function setup() {
  // Create a global instance of our template database, reusing a cached
  // template if migrations and sprocs haven't changed since the last run.
  await createTemplate();
  // Ensure any temporary directories created by `tmp-promise` are cleaned up
  // when the process exits.
  tmp.setGracefulCleanup();
}

export async function teardown() {
  // Keep the template database for reuse by future test runs. This only
  // closes the SQL connection; the cached template persists in Postgres.
  await closeSql();
}
