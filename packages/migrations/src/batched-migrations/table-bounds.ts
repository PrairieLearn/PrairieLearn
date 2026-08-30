import { z } from 'zod';

import { escapeIdentifier, queryRow } from '@prairielearn/postgres';

const TableIdBoundsSchema = z.object({
  min: z.bigint({ coerce: true }).nullable(),
  max: z.bigint({ coerce: true }).nullable(),
});

export async function selectTableIdBounds(tableName: string) {
  const escapedTableName = escapeIdentifier(tableName);
  return await queryRow(
    `SELECT MIN(id) AS min, MAX(id) AS max FROM ${escapedTableName}`,
    TableIdBoundsSchema,
  );
}
