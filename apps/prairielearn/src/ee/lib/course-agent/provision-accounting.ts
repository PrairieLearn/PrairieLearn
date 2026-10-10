import { readFile } from 'node:fs/promises';

import { Redis } from 'ioredis';

import { ConfigSchema } from '../../../lib/config.js';

// Explicit first-time provisioning only. Never reset financial state after a
// restart; reconcile outstanding CF evidence before an operator changes epochs.
const configPath = process.argv[2];
if (!configPath || process.argv.length !== 3) {
  throw new Error(
    'Usage: pnpm --filter @prairielearn/prairielearn course-agent:init-accounting path/to/config.json',
  );
}
const settings = ConfigSchema.pick({
  nonVolatileRedisUrl: true,
  cacheKeyPrefix: true,
  courseAgent: true,
}).parse(JSON.parse(await readFile(configPath, 'utf8')));
if (!settings.nonVolatileRedisUrl || !settings.courseAgent) {
  throw new Error('Course agent accounting is not configured.');
}
const redis = new Redis<'legacy'>(settings.nonVolatileRedisUrl, {
  maxRetriesPerRequest: 1,
  connectTimeout: 10000,
  commandTimeout: 10000,
});
try {
  const key = settings.cacheKeyPrefix + 'course-agent:ledger';
  const info = await redis.info('server');
  const runId = /run_id:(\w+)/.exec(info)?.[1];
  if (!runId) throw new Error('Redis process identity is unavailable.');
  const initialized = await redis.eval(
    await readFile(new URL('provision-accounting.lua', import.meta.url), 'utf8'),
    1,
    key,
    settings.courseAgent.accountingEpoch,
    runId,
  );
  if (initialized !== 1) {
    throw new Error(
      'Ledger already exists. Existing financial state was preserved; reconciliation is required before reopening a changed Redis process.',
    );
  }
  process.stdout.write(
    'Initialized the empty course-agent ledger. Verify Redis durability before allowing real inference.\n',
  );
} finally {
  await redis.quit();
}
