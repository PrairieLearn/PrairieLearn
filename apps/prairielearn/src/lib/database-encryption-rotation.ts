import { runPostgresEncryptedColumnOperation } from '@prairielearn/encrypted-storage';
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
}) {
  return await doWithLock('database-encryption', { autoRenew: true }, async () => {
    const cipher = getStorageCipher();
    const results = [];
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
