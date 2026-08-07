import * as crypto from 'node:crypto';

import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  createStorageCipher,
  prairieLearnCiphertextFormat,
  runPostgresEncryptedColumnOperation,
} from '@prairielearn/encrypted-storage';
import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { selectCredentials, upsertCredential } from '../models/ai-grading-credentials.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';
import { getOrCreateUser } from '../tests/utils/auth.js';
import { withConfig } from '../tests/utils/config.js';

import { runDatabaseEncryptionOperation } from './database-encryption-rotation.js';
import { decryptFromStorage } from './encrypted-storage.js';
import { TEST_COURSE_PATH } from './paths.js';

const sql = loadSqlEquiv(import.meta.url);

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
        nullable: false,
      }),
    ).rejects.toThrow('must use a single-column primary key');
  });

  it('skips null values and rotates non-null values', async () => {
    const primaryKey = crypto.randomBytes(32).toString('hex');
    const fallbackKey = crypto.randomBytes(32).toString('hex');
    const cipher = createStorageCipher({
      keyRing: [primaryKey, fallbackKey],
      format: prairieLearnCiphertextFormat,
    });
    const currentCiphertext = cipher.encrypt('current');
    const fallbackCiphertext = prairieLearnCiphertextFormat.encrypt('fallback', fallbackKey);
    await execute(sql.create_nullable_encrypted_values);
    await execute(sql.insert_nullable_encrypted_values, {
      current_ciphertext: currentCiphertext,
      fallback_ciphertext: fallbackCiphertext,
    });

    const target = {
      cipher,
      tableName: 'database_encryption_rotation_nullable_test',
      primaryKeyColumnName: 'id',
      ciphertextColumnName: 'encrypted_value',
      nullable: true,
      batchSize: 1,
    } as const;
    const inspection = await runPostgresEncryptedColumnOperation({ mode: 'check', ...target });
    assert.deepEqual(inspection, {
      target: 'database_encryption_rotation_nullable_test.encrypted_value',
      total: 2,
      needsRotation: 1,
    });

    const rotation = await runPostgresEncryptedColumnOperation({ mode: 'rotate', ...target });
    assert('rotated' in rotation);
    assert.deepEqual(rotation, {
      target: 'database_encryption_rotation_nullable_test.encrypted_value',
      total: 2,
      needsRotation: 0,
      passes: 1,
      rotated: 1,
      conflicts: 0,
    });

    const rows = await queryRows(
      sql.select_nullable_encrypted_values,
      z.object({ id: z.string(), encrypted_value: z.string().nullable() }),
    );
    assert.isNull(rows[0].encrypted_value);
    assert.equal(rows[1].encrypted_value, currentCiphertext);
    assert.notEqual(rows[2].encrypted_value, fallbackCiphertext);
    assert.equal(
      prairieLearnCiphertextFormat.decrypt(rows[2].encrypted_value!, primaryKey),
      'fallback',
    );
    assert.throws(() =>
      prairieLearnCiphertextFormat.decrypt(rows[2].encrypted_value!, fallbackKey),
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
      encrypted_secret_key: prairieLearnCiphertextFormat.encrypt('secret', fallbackKey),
      created_by: user.id,
    });

    await withConfig({ databaseEncryptionKey: [primaryKey, fallbackKey] }, async () => {
      const inspection = await runDatabaseEncryptionOperation({ mode: 'check', batchSize: 1 });
      assert.deepEqual(inspection, [
        {
          target: 'course_instance_ai_grading_credentials.encrypted_secret_key',
          total: 1,
          needsRotation: 1,
        },
      ]);

      const result = (await runDatabaseEncryptionOperation({ mode: 'rotate', batchSize: 1 }))[0];
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
      const inspection = (await runDatabaseEncryptionOperation({ mode: 'check', batchSize: 1 }))[0];
      assert.equal(inspection.needsRotation, 0);
    });
  });
});
