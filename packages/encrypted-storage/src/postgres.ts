import { z } from 'zod';

import {
  escapeIdentifier,
  execute,
  loadSqlEquiv,
  queryRows,
  queryScalar,
} from '@prairielearn/postgres';

import type { EncryptedValueTarget } from './rotation.js';

const sql = loadSqlEquiv(import.meta.url);

const PostgresEncryptedValueRowSchema = z.object({
  cursor: z.string(),
  ciphertext: z.string(),
});

export function createPostgresEncryptedValueTarget({
  tableName,
  primaryKeyColumnName,
  ciphertextColumnName,
}: {
  tableName: string;
  primaryKeyColumnName: string;
  ciphertextColumnName: string;
}): EncryptedValueTarget<string> {
  const table = escapeIdentifier(tableName);
  const primaryKeyColumn = escapeIdentifier(primaryKeyColumnName);
  const ciphertextColumn = escapeIdentifier(ciphertextColumnName);

  const selectFirstBatchSql = `
SELECT
  ${primaryKeyColumn}::text AS cursor,
  ${ciphertextColumn} AS ciphertext
FROM
  ${table}
ORDER BY
  ${primaryKeyColumn}
LIMIT
  $batch_size;
`;
  const selectNextBatchSql = `
SELECT
  ${primaryKeyColumn}::text AS cursor,
  ${ciphertextColumn} AS ciphertext
FROM
  ${table}
WHERE
  ${primaryKeyColumn} > $after_cursor
ORDER BY
  ${primaryKeyColumn}
LIMIT
  $batch_size;
`;
  const replaceIfUnchangedSql = `
UPDATE ${table}
SET
  ${ciphertextColumn} = $replacement_ciphertext
WHERE
  ${primaryKeyColumn} = $cursor
  AND ${ciphertextColumn} = $expected_ciphertext;
`;
  let primaryKeyValidation: Promise<void> | null = null;

  async function validatePrimaryKey() {
    const hasExpectedPrimaryKey = await queryScalar(
      sql.has_expected_primary_key,
      {
        table_name: table,
        primary_key_column_name: primaryKeyColumnName,
      },
      z.boolean(),
    );
    if (!hasExpectedPrimaryKey) {
      throw new Error(
        `Encryption target ${tableName} must use a single-column primary key as its cursor`,
      );
    }
  }

  return {
    name: `${tableName}.${ciphertextColumnName}`,
    async selectBatch({ after, limit }) {
      primaryKeyValidation ??= validatePrimaryKey();
      await primaryKeyValidation;
      if (after === null) {
        return await queryRows(
          selectFirstBatchSql,
          { batch_size: limit },
          PostgresEncryptedValueRowSchema,
        );
      }
      return await queryRows(
        selectNextBatchSql,
        { after_cursor: after, batch_size: limit },
        PostgresEncryptedValueRowSchema,
      );
    },
    async replaceIfUnchanged({ cursor, expectedCiphertext, replacementCiphertext }) {
      const updated = await execute(replaceIfUnchangedSql, {
        cursor,
        expected_ciphertext: expectedCiphertext,
        replacement_ciphertext: replacementCiphertext,
      });
      if (updated > 1) {
        throw new Error(`Encryption target ${tableName} primary key update affected multiple rows`);
      }
      return updated === 1;
    },
  };
}
