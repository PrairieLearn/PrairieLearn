import path from 'node:path';

import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { makePostgresTestUtils, queryAsync } from '@prairielearn/postgres';

import { getMigrationsToExecute, initWithLock } from './migrations.js';

describe('migrations', () => {
  describe('getMigrationsToExecute', () => {
    it('handles the case of no executed migrations', () => {
      const migrationFiles = [
        {
          directory: 'migrations',
          filename: '001_testing.sql',
          timestamp: '20220101010101',
        },
      ];
      assert.deepEqual(
        getMigrationsToExecute(migrationFiles, { excludeMigrations: [] }),
        migrationFiles,
      );
      assert.deepEqual(getMigrationsToExecute(migrationFiles, {}), migrationFiles);
    });

    it('handles case where subset of migrations have been executed', () => {
      const migrationFiles = [
        {
          directory: 'migrations',
          filename: '20220101010101_testing_1.sql',
          timestamp: '20220101010101',
        },
        {
          directory: 'migrations',
          filename: '20220101010102_testing_2.sql',
          timestamp: '20220101010102',
        },
        {
          directory: 'migrations',
          filename: '20220101010103_testing_3.sql',
          timestamp: '20220101010103',
        },
      ];
      const executedMigrations = [
        {
          timestamp: '20220101010101',
        },
        {
          timestamp: '20220101010102',
        },
      ];
      assert.deepEqual(
        getMigrationsToExecute(migrationFiles, { excludeMigrations: executedMigrations }),
        [
          {
            directory: 'migrations',
            timestamp: '20220101010103',
            filename: '20220101010103_testing_3.sql',
          },
        ],
      );
    });
  });

  it('handles case where beforeTimestamp is specified', () => {
    const migrationFiles = [
      {
        directory: 'migrations',
        filename: '20220101010101_testing_1.sql',
        timestamp: '20220101010101',
      },
      {
        directory: 'migrations',
        filename: '20220101010102_testing_2.sql',
        timestamp: '20220101010102',
      },
      {
        directory: 'migrations',
        filename: '20220101010103_testing_3.sql',
        timestamp: '20220101010103',
      },
    ];
    assert.deepEqual(
      getMigrationsToExecute(migrationFiles, {
        excludeMigrations: [],
        beforeTimestamp: '20220101010102',
      }),
      [
        {
          directory: 'migrations',
          filename: '20220101010101_testing_1.sql',
          timestamp: '20220101010101',
        },
      ],
    );
  });
  it('handles case where inclusiveBefore is specified', () => {
    const migrationFiles = [
      {
        directory: 'migrations',
        filename: '20220101010101_testing_1.sql',
        timestamp: '20220101010101',
      },
      {
        directory: 'migrations',
        filename: '20220101010102_testing_2.sql',
        timestamp: '20220101010102',
      },
      {
        directory: 'migrations',
        filename: '20220101010103_testing_3.sql',
        timestamp: '20220101010103',
      },
    ];
    assert.deepEqual(
      getMigrationsToExecute(migrationFiles, {
        excludeMigrations: [],
        beforeTimestamp: '20220101010102',
        inclusiveBefore: true,
      }),
      [
        {
          directory: 'migrations',
          filename: '20220101010101_testing_1.sql',
          timestamp: '20220101010101',
        },
        {
          directory: 'migrations',
          filename: '20220101010102_testing_2.sql',
          timestamp: '20220101010102',
        },
      ],
    );
  });

  describe('initWithLock', () => {
    const postgresTestUtils = makePostgresTestUtils({
      database: 'prairielearn_migrations',
    });

    beforeAll(async () => {
      await postgresTestUtils.createDatabase();
    });

    afterAll(async () => {
      await postgresTestUtils.dropDatabase();
    });

    it('runs both SQL and JavaScript migrations', async () => {
      const migrationDir = path.join(import.meta.dirname, 'fixtures');
      await initWithLock({ directories: [migrationDir], project: 'prairielearn_migrations' });

      // If both migrations ran successfully, there should be a single user
      // in the database.
      const users = await queryAsync('SELECT * FROM users', {});
      assert.lengthOf(users.rows, 1);
      assert.equal(users.rows[0].name, 'Test User');
    });
  });
});
