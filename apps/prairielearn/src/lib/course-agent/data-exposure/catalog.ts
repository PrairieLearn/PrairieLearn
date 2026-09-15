import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import type { CatalogColumn, CatalogForeignKey } from './types.js';

const sql = loadSqlEquiv(import.meta.url);

const CatalogColumnSchema = z.object({
  table_name: z.string(),
  column_name: z.string(),
  pg_type: z.string(),
});

const CatalogForeignKeySchema = z.object({
  constraint_name: z.string(),
  from_table: z.string(),
  from_columns: z.array(z.string()),
  to_table: z.string(),
  to_columns: z.array(z.string()),
});

export async function loadPublicCatalog(): Promise<{
  columns: CatalogColumn[];
  foreignKeys: CatalogForeignKey[];
}> {
  const [columnRows, foreignKeyRows] = await Promise.all([
    queryRows(sql.select_public_columns, CatalogColumnSchema),
    queryRows(sql.select_public_foreign_keys, CatalogForeignKeySchema),
  ]);

  return {
    columns: columnRows.map((row) => ({
      tableName: row.table_name,
      columnName: row.column_name,
      pgType: row.pg_type,
    })),
    foreignKeys: foreignKeyRows.map((row) => ({
      constraintName: row.constraint_name,
      fromTable: row.from_table,
      fromColumns: row.from_columns,
      toTable: row.to_table,
      toColumns: row.to_columns,
    })),
  };
}
