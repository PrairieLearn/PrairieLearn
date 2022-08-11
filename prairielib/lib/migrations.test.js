// @ts-check
/* eslint-env jest */

const path = require('path');
const tmp = require('tmp-promise');
const fs = require('fs-extra');

const { readAndValidateMigrationsFromDirectory } = require('./migrations');

async function withMigrationFiles(files, fn) {
  await tmp.withDir(
    async function (tmpDir) {
      for (const file of files) {
        fs.writeFile(path.join(tmpDir.path, file), '');
      }
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

    it('handles mismatched timestamps and indexes', async () => {
      await withMigrationFiles(
        ['20220101010101_testing.sql', '002_testing_again.sql'],
        async (tmpDir) => {
          await expect(readAndValidateMigrationsFromDirectory(tmpDir)).rejects.toThrow(
            'One or more migration files are missing timestamps'
          );
        }
      );
    });
  });
});
