import { assert } from 'chai';

import { getMigrationsToExecute } from './migrations';

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
      assert.deepEqual(getMigrationsToExecute(migrationFiles, []), migrationFiles);
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
      assert.deepEqual(getMigrationsToExecute(migrationFiles, executedMigrations), [
        {
          directory: 'migrations',
          timestamp: '20220101010103',
          filename: '20220101010103_testing_3.sql',
        },
      ]);
    });
  });
});
