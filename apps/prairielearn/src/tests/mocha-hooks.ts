import { type RootHookObject } from 'mocha';

import { createTemplate, dropTemplate } from './helperDb';

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
 * These hooks run once per worker when Mocha is running in parallel mode.
 * We take advantage of this to create a separate database for each worker.
 */
export const mochaHooks: RootHookObject = {
  async beforeAll() {
    const logger = await import('@prairielearn/logger');

    const consoleTransport = logger.logger.transports.find(
      // @ts-expect-error - The `TransportStream` type does not include `name`.
      (transport) => transport.name === 'console',
    );
    if (!consoleTransport) throw new Error('Could not find console transport');
    consoleTransport.level = 'warn';

    // We can't use `import` here because this is a TS file and our tooling
    // isn't yet set up to do dynamic imports of `.ts` files.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('../lib/config');
    config.workersCount = 2; // explicitly use 2 workers to test parallelism
    config.fileEditorUseGit = true; // test use of git in file editor

    // Allow using `chai-as-promised` in all tests.
    const chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');
    // @ts-expect-error -- Dynamic imports do have a `.default` property, but
    // `allowSyntheticDefaultImports` is disabled at the time of writing, so
    // TypeScript doesn't know about it.
    chai.use(chaiAsPromised.default);
  },
};
