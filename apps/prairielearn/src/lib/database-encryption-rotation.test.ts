import * as crypto from 'node:crypto';

import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import {
  createStorageCipher,
  prairieLearnCiphertextFormat,
  runPostgresEncryptedColumnOperation,
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
    const cipher = createStorageCipher({
      keyRing: crypto.randomBytes(32).toString('hex'),
      format: prairieLearnCiphertextFormat,
    });

    await expect(
      runPostgresEncryptedColumnOperation({
        mode: 'check',
        cipher,
        tableName: 'course_instance_ai_grading_credentials',
        primaryKeyColumnName: 'provider',
        ciphertextColumnName: 'encrypted_secret_key',
      }),
    ).rejects.toThrow('must use a single-column primary key');
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
      encrypted_secret_key: prairieLearnCiphertextFormat.encrypt('secret', fallbackKey),
      created_by: user.id,
    });

    await withConfig({ databaseEncryptionKey: [primaryKey, fallbackKey] }, async () => {
      const inspection = await runDatabaseEncryptionOperation({ mode: 'check', batchSize: 1 });
      assert.deepEqual(inspection, {
        target: 'course_instance_ai_grading_credentials.encrypted_secret_key',
        total: 1,
        needsRotation: 1,
      });

      const result = await runDatabaseEncryptionOperation({ mode: 'rotate', batchSize: 1 });
      assert('rotated' in result);
      assert.equal(result.rotated, 1);
      assert.equal(result.needsRotation, 0);
    });

    const credentials = await selectCredentials('1');
    assert.lengthOf(credentials, 1);
    assert.equal(
      prairieLearnCiphertextFormat.decrypt(credentials[0].encrypted_secret_key, primaryKey),
      'secret',
    );
    assert.throws(() =>
      prairieLearnCiphertextFormat.decrypt(credentials[0].encrypted_secret_key, fallbackKey),
    );

    await withConfig({ databaseEncryptionKey: [primaryKey] }, async () => {
      assert.equal(decryptFromStorage(credentials[0].encrypted_secret_key), 'secret');
      const inspection = await runDatabaseEncryptionOperation({ mode: 'check', batchSize: 1 });
      assert.equal(inspection.needsRotation, 0);
    });
  });
});
