import {
  type EncryptionInspection,
  type EncryptionRotation,
  runPostgresEncryptedColumnOperation,
} from '@prairielearn/encrypted-storage';
import { doWithLock } from '@prairielearn/named-locks';

import { getStorageCipher } from './encrypted-storage.js';

const LOCK_NAME = 'database-encryption:ai-grading-credentials';

export async function runDatabaseEncryptionOperation({
  mode,
  batchSize = 100,
}: {
  mode: 'check' | 'rotate';
  batchSize?: number;
}): Promise<EncryptionInspection | EncryptionRotation> {
  return await doWithLock(LOCK_NAME, { autoRenew: true }, async () => {
    return await runPostgresEncryptedColumnOperation({
      mode,
      cipher: getStorageCipher(),
      tableName: 'course_instance_ai_grading_credentials',
      primaryKeyColumnName: 'id',
      ciphertextColumnName: 'encrypted_secret_key',
      batchSize,
    });
  });
}
