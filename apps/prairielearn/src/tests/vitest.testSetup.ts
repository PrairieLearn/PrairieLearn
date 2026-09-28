import { beforeAll } from 'vitest';

beforeAll(async () => {
  const { logger } = await import('@prairielearn/logger');
  logger.level = 'warn';

  // We can't use `import` here because this is a TS file and our tooling
  // isn't yet set up to do dynamic imports of `.ts` files.
  const { config, resetConfig } = await import('../lib/config.js');

  // Reset the config to its default state to ensure that state doesn't leak
  // between tests, even in the case of timeouts that would prevent tests from
  // cleaning up after themselves.
  resetConfig();

  config.workersCount = 2; // explicitly use 2 workers to test parallelism
  config.fileEditorUseGit = true; // test use of git in file editor
});
