import tmp from 'tmp-promise';

import { createTemplate, dropTemplate } from './helperDb.js';

export async function setup() {
  // Create a global instance of our template database, dropping the existing
  // template database first if needed.
  await createTemplate();
  // Ensure any temporary directories created by `tmp-promise` are cleaned up
  // when the process exits.
  tmp.setGracefulCleanup();
}

export async function teardown() {
  // Drop the template database to clean up after ourselves.
  await dropTemplate();
}
