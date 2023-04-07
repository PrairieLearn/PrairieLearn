import { assert } from 'chai';
import path from 'node:path';
import { makePostgresTestUtils } from '@prairielearn/postgres';
import * as namedLocks from '@prairielearn/named-locks';

import { SCHEMA_MIGRATIONS_PATH, init } from '../index';
import { BatchedMigrationsRunner } from './batched-migrations-runner';
import { selectAllBatchedMigrations } from './batched-migration';

const postgresTestUtils = makePostgresTestUtils({
  database: 'prairielearn_migrations',
});

describe('BatchedMigrationsRunner', () => {
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

    const migrations = await selectAllBatchedMigrations('test');

    assert.lengthOf(migrations, 2);
    assert.equal(migrations[0].timestamp, '20230406184103');
    assert.equal(migrations[0].filename, '20230406184103_test_migration_1.ts');
    assert.equal(migrations[1].timestamp, '20230406184107');
    assert.equal(migrations[1].filename, '20230406184107_test_migration_2.js');
  });
});
