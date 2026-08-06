import * as crypto from 'node:crypto';

import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import {
  createPostgresEncryptedValueTarget,
  encryptLegacyPrairieLearn,
} from '@prairielearn/encrypted-storage';

import { selectCredentials, upsertCredential } from '../models/ai-grading-credentials.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';
import { withConfig } from '../tests/utils/config.js';

import { runDatabaseEncryptionOperation } from './database-encryption-rotation.js';
import { decryptFromStorage } from './encrypted-storage.js';
import { TEST_COURSE_PATH } from './paths.js';

describe('database encryption rotation', () => {
  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
  });
  afterAll(helperDb.after);

  it('rejects a Postgres target that does not use a single-column primary key', async () => {
    const target = createPostgresEncryptedValueTarget({
      tableName: 'course_instance_ai_grading_credentials',
      primaryKeyColumnName: 'provider',
      ciphertextColumnName: 'encrypted_secret_key',
    });

    await expect(target.selectBatch({ after: null, limit: 1 })).rejects.toThrow(
      'must use a single-column primary key as its cursor',
    );
  });

  it('rotates production legacy data and verifies it with only the primary key', async () => {
    const primaryKey = crypto.randomBytes(32).toString('hex');
    const fallbackKey = crypto.randomBytes(32).toString('hex');
    const user = await getOrCreateUser({
      uid: 'rotation@example.com',
      name: 'Rotation Test User',
      uin: 'rotation-test-user',
      email: 'rotation@example.com',
    });
    await upsertCredential({
      course_instance_id: '1',
      provider: 'openai',
      encrypted_secret_key: encryptLegacyPrairieLearn('secret', fallbackKey),
      created_by: user.id,
    });

    await withConfig(
      {
        databaseEncryptionKey: [primaryKey, fallbackKey],
        databaseEncryptionWriteFormat: 'legacy',
      },
      async () => {
        const inspection = await runDatabaseEncryptionOperation({ mode: 'check', batchSize: 1 });
        assert('needsRotation' in inspection);
        assert.deepEqual(inspection, {
          target: 'course_instance_ai_grading_credentials.encrypted_secret_key',
          total: 1,
          current: 0,
          needsRotation: 1,
        });
        await expect(
          runDatabaseEncryptionOperation({ mode: 'rotate', batchSize: 1 }),
        ).rejects.toThrow(/operators must ensure every writer/);
      },
    );

    await withConfig(
      {
        databaseEncryptionKey: [primaryKey, fallbackKey],
        databaseEncryptionWriteFormat: 'v1',
      },
      async () => {
        const result = await runDatabaseEncryptionOperation({ mode: 'rotate', batchSize: 1 });
        assert('verification' in result);
        assert.equal(result.rotated, 1);
        assert.equal(result.verification.needsRotation, 0);
      },
    );

    await withConfig(
      { databaseEncryptionKey: [primaryKey], databaseEncryptionWriteFormat: 'v1' },
      async () => {
        const credentials = await selectCredentials('1');
        assert.lengthOf(credentials, 1);
        assert.match(credentials[0].encrypted_secret_key, /^plenc:v1:/);
        assert.equal(decryptFromStorage(credentials[0].encrypted_secret_key), 'secret');

        const inspection = await runDatabaseEncryptionOperation({ mode: 'check', batchSize: 1 });
        assert('needsRotation' in inspection);
        assert.equal(inspection.needsRotation, 0);
      },
    );
  });
});
