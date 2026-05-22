import path from 'node:path';

import fs from 'fs-extra';
import tmp from 'tmp-promise';
import { afterEach, assert, describe, it } from 'vitest';

import { config } from './config.js';
import {
  createQtiImportDraft,
  deleteQtiImportDraft,
  readQtiImportDraft,
} from './qti-import-drafts.js';

const originalFileStoreS3Bucket = config.fileStoreS3Bucket;
const originalFilesRoot = config.filesRoot;

afterEach(() => {
  config.fileStoreS3Bucket = originalFileStoreS3Bucket;
  config.filesRoot = originalFilesRoot;
});

describe('qti-import-drafts', () => {
  it('stores drafts on the filesystem when no file store S3 bucket is configured', async () => {
    await tmp.withDir(
      async ({ path: filesRoot }) => {
        config.fileStoreS3Bucket = null;
        config.filesRoot = filesRoot;

        const draftId = await createQtiImportDraft({
          courseId: '1',
          courseInstanceId: '2',
          userId: '3',
          results: [{ questions: [] }],
        });

        assert.isTrue(
          await fs.pathExists(path.join(filesRoot, 'qti-import-drafts', `${draftId}.json`)),
        );

        const draft = await readQtiImportDraft({
          draftId,
          courseId: '1',
          courseInstanceId: '2',
          userId: '3',
        });

        assert.deepEqual(draft.results, [{ questions: [] }]);

        await deleteQtiImportDraft(draftId);
        assert.isFalse(
          await fs.pathExists(path.join(filesRoot, 'qti-import-drafts', `${draftId}.json`)),
        );
      },
      { unsafeCleanup: true },
    );
  });
});
