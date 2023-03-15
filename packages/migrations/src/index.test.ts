import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import path from 'path';
import tmp from 'tmp-promise';
import fs from 'fs-extra';

import {
  readAndValidateMigrationsFromDirectory,
  sortMigrationFiles,
  getMigrationsToExecute,
} from './index';

chai.use(chaiAsPromised);

async function withMigrationFiles(files: string[], fn: (tmpDir: string) => Promise<void>) {
  await tmp.withDir(
    async function (tmpDir) {
      for (const file of files) {
        await fs.writeFile(path.join(tmpDir.path, file), '');
      }
      await fn(tmpDir.path);
    },
    { unsafeCleanup: true }
  );
}

describe('migrations', () => {
  describe('readAndValidateMigrationsFromDirectory', () => {
    it('handles migrations without a timestamp', async () => {
      await withMigrationFiles(['001_testing.sql'], async (tmpDir) => {
        await assert.isRejected(
          readAndValidateMigrationsFromDirectory(tmpDir),
          'Invalid migration filename: 001_testing.sql'
        );
      });
    });

    it('handles duplicate timestamps', async () => {
      await withMigrationFiles(
        ['20220101010101_testing.sql', '20220101010101_testing_again.sql'],
        async (tmpDir) => {
          await assert.isRejected(
            readAndValidateMigrationsFromDirectory(tmpDir),
            'Duplicate migration timestamp'
          );
        }
      );
    });
  });

  describe('sortMigrationFiles', () => {
    it('sorts by timestamp', () => {
      assert.deepEqual(
        sortMigrationFiles([
          {
            filename: '20220101010103_testing_3.sql',
            timestamp: '20220101010103',
          },
          {
            filename: '20220101010101_testing_1.sql',
            timestamp: '20220101010101',
          },
          {
            filename: '20220101010102_testing_2.sql',
            timestamp: '20220101010102',
          },
        ]),
        [
          {
            filename: '20220101010101_testing_1.sql',
            timestamp: '20220101010101',
          },
          {
            filename: '20220101010102_testing_2.sql',
            timestamp: '20220101010102',
          },
          {
            filename: '20220101010103_testing_3.sql',
            timestamp: '20220101010103',
          },
        ]
      );
    });
  });

  describe('getMigrationsToExecute', () => {
    it('handles the case of no executed migrations', () => {
      const migrationFiles = [
        {
          filename: '001_testing.sql',
          timestamp: '20220101010101',
        },
      ];
      assert.deepEqual(getMigrationsToExecute(migrationFiles, []), migrationFiles);
    });

    it('handles case where subset of migrations have been executed', () => {
      const migrationFiles = [
        {
          filename: '20220101010101_testing_1.sql',
          timestamp: '20220101010101',
        },
        {
          filename: '20220101010102_testing_2.sql',
          timestamp: '20220101010102',
        },
        {
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
        { timestamp: '20220101010103', filename: '20220101010103_testing_3.sql' },
      ]);
    });
  });
});
