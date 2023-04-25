// @ts-check
import { createTemplate, dropTemplate } from './helperDb.js';

export async function mochaGlobalSetup() {
  // Create a global instance of our template database, dropping the existing
  // template database first if needed.
  await createTemplate();
}

export async function mochaGlobalTeardown() {
  // Drop the template database to clean up after ourselves.
  await dropTemplate();
}

/**
 * @type {import('mocha').RootHookObject}
 *
 * These hooks run once per worker when Mocha is running in parallel mode.
 * We take advantage of this to create a separate database for each worker.
 */
export const mochaHooks = {
  beforeAll: async function () {
    const logger = await import('@prairielearn/logger');

    const consoleTransport = logger.logger.transports.find(
      // @ts-expect-error - The `TransportStream` type does not include `name`.
      (transport) => transport.name === 'console'
    );
    if (!consoleTransport) throw new Error('Could not find console transport');
    consoleTransport.level = 'warn';

    const { config } = (await import('../lib/config.js')).default;
    config.workersCount = 2; // explicitly use 2 workers to test parallelism
    config.fileEditorUseGit = true; // test use of git in file editor
  },
};
