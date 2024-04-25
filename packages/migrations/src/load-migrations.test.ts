import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import path from 'path';
import tmp from 'tmp-promise';
import fs from 'fs-extra';

import {
  parseAnnotations,
  readAndValidateMigrationsFromDirectory,
  sortMigrationFiles,
} from './load-migrations';

chai.use(chaiAsPromised);

async function withMigrationFiles(files: string[], fn: (tmpDir: string) => Promise<void>) {
  await tmp.withDir(
    async function (tmpDir) {
      for (const file of files) {
        await fs.writeFile(path.join(tmpDir.path, file), '');
      }
      await fn(tmpDir.path);
    },
    { unsafeCleanup: true },
  );
}

describe('load-migrations', () => {
  describe('readAndValidateMigrationsFromDirectory', () => {
    it('handles migrations without a timestamp', async () => {
      await withMigrationFiles(['001_testing.sql'], async (tmpDir) => {
        await assert.isRejected(
          readAndValidateMigrationsFromDirectory(tmpDir, ['.sql']),
          'Invalid migration filename: 001_testing.sql',
        );
      });
    });

    it('handles duplicate timestamps', async () => {
      await withMigrationFiles(
        ['20220101010101_testing.sql', '20220101010101_testing_again.sql'],
        async (tmpDir) => {
          await assert.isRejected(
            readAndValidateMigrationsFromDirectory(tmpDir, ['.sql']),
            'Duplicate migration timestamp',
          );
        },
      );
    });
  });

  describe('sortMigrationFiles', () => {
    it('sorts by timestamp', () => {
      assert.deepEqual(
        sortMigrationFiles([
          {
            directory: 'migrations',
            filename: '20220101010103_testing_3.sql',
            timestamp: '20220101010103',
          },
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
        ]),
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
          {
            directory: 'migrations',
            filename: '20220101010103_testing_3.sql',
            timestamp: '20220101010103',
          },
        ],
      );
    });
  });

  describe('parseAnnotations', () => {
    it('parses a NO TRANSACTION annotation', () => {
      const annotations = parseAnnotations('-- prairielearn:migrations NO TRANSACTION');
      assert.deepEqual(annotations, new Set(['NO TRANSACTION']));
    });

    it('throws an error for an invalid annotation', () => {
      assert.throws(() => {
        parseAnnotations('-- prairielearn:migrations INVALID');
      });
    });
  });
});
