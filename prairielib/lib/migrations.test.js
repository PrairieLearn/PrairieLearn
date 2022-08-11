// @ts-check
/* eslint-env jest */

const path = require('path');
const tmp = require('tmp-promise');
const fs = require('fs-extra');

const {
  readAndValidateMigrationsFromDirectory,
  sortMigrationFiles,
  getMigrationsToExecute,
} = require('./migrations');

async function withMigrationFiles(files, fn) {
  await tmp.withDir(
    async function (tmpDir) {
      for (const file of files) {
        fs.writeFile(path.join(tmpDir.path, file), '');
      }
      console.log(tmpDir.path);
      await fn(tmpDir.path);
    },
    { unsafeCleanup: true }
  );
}

describe('migrations', () => {
  describe('readAndValidateMigrationsFromDirectory', () => {
    it('handles duplicate indexes', async () => {
      await withMigrationFiles(['001_testing.sql', '001_testing_again.sql'], async (tmpDir) => {
        await expect(readAndValidateMigrationsFromDirectory(tmpDir)).rejects.toThrow(
          'Duplicate migration index'
        );
      });
    });

    it('handles duplicate timestamps', async () => {
      await withMigrationFiles(
        ['20220101010101_testing.sql', '20220101010101_testing_again.sql'],
        async (tmpDir) => {
          await expect(readAndValidateMigrationsFromDirectory(tmpDir)).rejects.toThrow(
            'Duplicate migration timestamp'
          );
        }
      );
    });

    it('handles missing indexes', async () => {
      await withMigrationFiles(
        ['20220101010101_001_testing.sql', '20220101010102_testing_again.sql'],
        async (tmpDir) => {
          await expect(readAndValidateMigrationsFromDirectory(tmpDir)).rejects.toThrow(
            'One or more migration files are missing indexes'
          );
        }
      );
    });

    it('handles missing timestamps', async () => {
      await withMigrationFiles(
        ['20220101010101_001_testing.sql', '002_testing_again.sql'],
        async (tmpDir) => {
          await expect(readAndValidateMigrationsFromDirectory(tmpDir)).rejects.toThrow(
            'One or more migration files are missing timestamps'
          );
        }
      );
    });
  });

  describe('sortMigrationFiles', () => {
    it('sorts by timestamp when it is available', () => {
      expect(
        sortMigrationFiles([
          {
            filename: '20220101010103_testing_3.sql',
            timestamp: '20220101010103',
            index: null,
          },
          {
            filename: '20220101010101_testing_1.sql',
            timestamp: '20220101010101',
            index: null,
          },
          {
            filename: '20220101010102_testing_2.sql',
            timestamp: '20220101010102',
            index: null,
          },
        ])
      ).toEqual([
        {
          filename: '20220101010101_testing_1.sql',
          timestamp: '20220101010101',
          index: null,
        },
        {
          filename: '20220101010102_testing_2.sql',
          timestamp: '20220101010102',
          index: null,
        },
        {
          filename: '20220101010103_testing_3.sql',
          timestamp: '20220101010103',
          index: null,
        },
      ]);
    });

    it('sorts by index when timestamp is unavailable', () => {
      expect(
        sortMigrationFiles([
          {
            filename: '003_testing_3.sql',
            timestamp: null,
            index: 3,
          },
          {
            filename: '001_testing_1.sql',
            timestamp: null,
            index: 1,
          },
          {
            filename: '002_testing_2.sql',
            timestamp: null,
            index: 2,
          },
        ])
      ).toEqual([
        {
          filename: '001_testing_1.sql',
          timestamp: null,
          index: 1,
        },
        {
          filename: '002_testing_2.sql',
          timestamp: null,
          index: 2,
        },
        {
          filename: '003_testing_3.sql',
          timestamp: null,
          index: 3,
        },
      ]);
    });
  });

  describe('getMigrationsToExecute', () => {
    it('handles the case of no executed migrations', () => {
      const migrationFiles = [
        {
          filename: '001_testing.sql',
          index: 1,
          timestamp: null,
        },
      ];
      expect(getMigrationsToExecute(migrationFiles, [])).toEqual(migrationFiles);
    });

    it('handles the case of migrations keyed by timestamp', () => {
      const migrationFiles = [
        {
          filename: '20220101010101_testing_1.sql',
          index: null,
          timestamp: '20220101010101',
        },
        {
          filename: '20220101010102_testing_2.sql',
          index: null,
          timestamp: '20220101010102',
        },
        {
          filename: '20220101010103_testing_3.sql',
          index: null,
          timestamp: '20220101010103',
        },
      ];
      const executedMigrations = [
        {
          index: null,
          timestamp: '20220101010101',
        },
        {
          index: null,
          timestamp: '20220101010102',
        },
      ];
      expect(getMigrationsToExecute(migrationFiles, executedMigrations)).toEqual([
        { timestamp: '20220101010103', filename: '20220101010103_testing_3.sql', index: null },
      ]);
    });

    it('handles the case of migrations keyed by index', () => {
      const migrationFiles = [
        {
          filename: '001_testing_1.sql',
          index: 1,
          timestamp: null,
        },
        {
          filename: '002_testing_2.sql',
          index: 2,
          timestamp: null,
        },
        {
          filename: '003_testing_3.sql',
          index: 3,
          timestamp: null,
        },
      ];
      const executedMigrations = [
        {
          index: 1,
          timestamp: null,
        },
        {
          index: 2,
          timestamp: null,
        },
      ];
      expect(getMigrationsToExecute(migrationFiles, executedMigrations)).toEqual([
        { timestamp: null, filename: '003_testing_3.sql', index: 3 },
      ]);
    });
  });
});
