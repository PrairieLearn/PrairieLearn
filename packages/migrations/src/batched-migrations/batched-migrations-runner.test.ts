import { assert } from 'chai';
import path from 'node:path';
import { makePostgresTestUtils } from '@prairielearn/postgres';
import * as namedLocks from '@prairielearn/named-locks';

import { SCHEMA_MIGRATIONS_PATH, init, BatchedMigrationsRunner } from '../index';

const postgresTestUtils = makePostgresTestUtils({
  database: 'prairielearn_migrations',
});

describe.only('BatchedMigrationsRunner', () => {
  before(async () => {
    await postgresTestUtils.createDatabase();
    await namedLocks.init(postgresTestUtils.getPoolConfig(), (err) => {
      throw err;
    });
    await init([SCHEMA_MIGRATIONS_PATH], 'prairielearn_migrations');
  });

  afterEach(async () => {
    await postgresTestUtils.resetDatabase();
  });

  after(async () => {
    await namedLocks.close();
    await postgresTestUtils.dropDatabase();
  });

  it('loads migrations from a directory', async () => {
    const runner = new BatchedMigrationsRunner({
      project: 'test',
      directories: [path.join(__dirname, 'fixtures')],
    });

    await runner.init();
    const migrations = await runner.allBatchedMigrations();

    assert.lengthOf(migrations, 2);
  });
});
