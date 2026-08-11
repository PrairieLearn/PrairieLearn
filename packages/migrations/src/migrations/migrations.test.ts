import path from 'node:path';

import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, makePostgresTestUtils, queryRow, queryScalar } from '@prairielearn/postgres';

import { getMigrationsToExecute, getPendingMigrations, initWithLock } from './migrations.js';

const sql = loadSqlEquiv(import.meta.filename);

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

    it('reports all migrations without modifying a fresh database', async () => {
      const migrationDir = path.join(import.meta.dirname, 'fixtures');
      const pendingMigrations = await getPendingMigrations({
        directories: [migrationDir],
        project: 'prairielearn_migrations',
      });

      assert.deepEqual(pendingMigrations, [
        {
          filename: '20230407210409_create_users.sql',
          timestamp: '20230407210409',
        },
        {
          filename: '20230407210430_insert_user.ts',
          timestamp: '20230407210430',
        },
      ]);

      const migrationsTable = await queryScalar(sql.get_migrations_table, z.string().nullable());
      assert.isNull(migrationsTable);
    });

    it('runs both SQL and JavaScript migrations', async () => {
      const migrationDir = path.join(import.meta.dirname, 'fixtures');
      await initWithLock({ directories: [migrationDir], project: 'prairielearn_migrations' });

      // If both migrations ran successfully, there should be a single user
      // in the database.
      const users = await queryRow('SELECT * FROM users', {}, z.object({ name: z.string() }));
      assert.equal(users.name, 'Test User');

      assert.deepEqual(
        await getPendingMigrations({
          directories: [migrationDir],
          project: 'prairielearn_migrations',
        }),
        [],
      );
      assert.lengthOf(
        await getPendingMigrations({
          directories: [migrationDir],
          project: 'prairietest',
        }),
        2,
      );
    });
  });
});
