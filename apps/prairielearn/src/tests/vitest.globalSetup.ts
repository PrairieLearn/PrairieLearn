import tmp from 'tmp-promise';

import { createTemplate, dropTemplate } from './helperDb.js';

// Several projects share this setup (see `vitest.config.ts` at the repository
// root), and Vitest runs it once for each of them that has tests to run. Global
// setup always runs in the main Vitest process, so only the first project to
// get here creates the template database, and only it drops it afterwards.
declare global {
  var prairielearnTemplateCreated: boolean | undefined;
}

export async function setup() {
  if (globalThis.prairielearnTemplateCreated) return;
  globalThis.prairielearnTemplateCreated = true;

  // Create a global instance of our template database, dropping the existing
  // template database first if needed.
  await createTemplate();
  // Ensure any temporary directories created by `tmp-promise` are cleaned up
  // when the process exits.
  tmp.setGracefulCleanup();

  return async () => {
    // Drop the template database to clean up after ourselves.
    await dropTemplate();
  };
}
