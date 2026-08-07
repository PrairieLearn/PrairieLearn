import {
  type EncryptionInspection,
  type EncryptionRotation,
  runPostgresEncryptedColumnOperation,
} from '@prairielearn/encrypted-storage';
import { doWithLock } from '@prairielearn/named-locks';

import { getStorageCipher } from './encrypted-storage.js';

const encryptedColumns = [
  {
    tableName: 'course_instance_ai_grading_credentials',
    primaryKeyColumnName: 'id',
    ciphertextColumnName: 'encrypted_secret_key',
    nullable: false,
  },
] as const;

export async function runDatabaseEncryptionOperation({
  mode,
  batchSize = 100,
}: {
  mode: 'check' | 'rotate';
  batchSize?: number;
}): Promise<(EncryptionInspection | EncryptionRotation)[]> {
  return await doWithLock('database-encryption', { autoRenew: true }, async () => {
    const cipher = getStorageCipher();
    const results: (EncryptionInspection | EncryptionRotation)[] = [];
    for (const column of encryptedColumns) {
      results.push(
        await runPostgresEncryptedColumnOperation({
          mode,
          cipher,
          ...column,
          batchSize,
        }),
      );
    }
    return results;
  });
}
