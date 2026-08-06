import { z } from 'zod';

import {
  escapeIdentifier,
  execute,
  loadSqlEquiv,
  queryRows,
  queryScalar,
} from '@prairielearn/postgres';

import type { StorageCipher } from './cipher.js';

const sql = loadSqlEquiv(import.meta.url);

const EncryptedValueRowSchema = z.object({
  cursor: z.string(),
  ciphertext: z.string(),
});

export interface EncryptionInspection {
  target: string;
  total: number;
  needsRotation: number;
}

export interface EncryptionRotation extends EncryptionInspection {
  passes: number;
  rotated: number;
  conflicts: number;
}

export type EncryptionOperationMode = 'check' | 'rotate';

function validatePositiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

export async function runPostgresEncryptedColumnOperation({
  mode,
  cipher,
  tableName,
  primaryKeyColumnName,
  ciphertextColumnName,
  batchSize = 100,
  maxPasses = 3,
}: {
  mode: EncryptionOperationMode;
  cipher: StorageCipher;
  tableName: string;
  primaryKeyColumnName: string;
  ciphertextColumnName: string;
  batchSize?: number;
  maxPasses?: number;
}): Promise<EncryptionInspection | EncryptionRotation> {
  validatePositiveInteger(batchSize, 'batchSize');
  if (mode === 'rotate') validatePositiveInteger(maxPasses, 'maxPasses');

  const table = escapeIdentifier(tableName);
  const primaryKeyColumn = escapeIdentifier(primaryKeyColumnName);
  const ciphertextColumn = escapeIdentifier(ciphertextColumnName);
  const target = `${tableName}.${ciphertextColumnName}`;

  const hasExpectedPrimaryKey = await queryScalar(
    sql.has_expected_primary_key,
    {
      table_name: table,
      primary_key_column_name: primaryKeyColumnName,
    },
    z.boolean(),
  );
  if (!hasExpectedPrimaryKey) {
    throw new Error(`Encryption target ${tableName} must use a single-column primary key`);
  }

  const selectBatchSql = `
SELECT
  ${primaryKeyColumn}::text AS cursor,
  ${ciphertextColumn} AS ciphertext
FROM
  ${table}
WHERE
  $first_batch
  OR ${primaryKeyColumn} > $after_cursor
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

  async function forEachValue(
    fn: (row: z.infer<typeof EncryptedValueRowSchema>) => Promise<void> | void,
  ) {
    let after: string | null = null;
    let total = 0;
    while (true) {
      const rows: z.infer<typeof EncryptedValueRowSchema>[] = await queryRows(
        selectBatchSql,
        { first_batch: after === null, after_cursor: after, batch_size: batchSize },
        EncryptedValueRowSchema,
      );
      if (rows.length === 0) return total;
      for (const row of rows) await fn(row);
      total += rows.length;
      after = rows.at(-1)!.cursor;
    }
  }

  async function inspect(): Promise<EncryptionInspection> {
    let needsRotation = 0;
    const total = await forEachValue(({ ciphertext }) => {
      if (cipher.needsRotation(ciphertext)) needsRotation += 1;
    });
    return { target, total, needsRotation };
  }

  if (mode === 'check') return await inspect();

  let rotated = 0;
  let conflicts = 0;
  let remaining = 0;
  for (let pass = 1; pass <= maxPasses; pass += 1) {
    await forEachValue(async ({ cursor, ciphertext }) => {
      const replacementCiphertext = cipher.rotate(ciphertext);
      if (replacementCiphertext === null) return;

      const updated = await execute(replaceIfUnchangedSql, {
        cursor,
        expected_ciphertext: ciphertext,
        replacement_ciphertext: replacementCiphertext,
      });
      if (updated > 1) {
        throw new Error(`Encryption target ${tableName} primary key update affected multiple rows`);
      }
      if (updated === 1) {
        rotated += 1;
      } else {
        conflicts += 1;
      }
    });

    const inspection = await inspect();
    remaining = inspection.needsRotation;
    if (inspection.needsRotation === 0) {
      return { ...inspection, passes: pass, rotated, conflicts };
    }
  }

  throw new Error(
    `Encryption rotation for ${target} left ${remaining} values requiring rotation after ${maxPasses} passes (${conflicts} concurrent update conflicts)`,
  );
}
