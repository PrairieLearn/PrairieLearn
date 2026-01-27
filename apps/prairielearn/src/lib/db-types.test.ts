import { difference } from 'es-toolkit';
import { afterAll, beforeAll, describe, it } from 'vitest';
import type z from 'zod';

import { describeDatabase } from '@prairielearn/postgres-tools';

import * as helperDb from '../tests/helperDb.js';

import * as DbSchemas from './db-types.js';
import { TableNames } from './db-types.js';

const schemaNameOverrides: Record<string, string | null> = {
  last_accesses: 'LastAccessSchema',
  query_runs: 'QueryRunSchema',
  time_series: 'TimeSeriesSchema',
};

const customSchemas = new Set(['IdSchema', 'IntervalSchema']);
const unusedSchemas = new Set([
  'JsonCommentSchema',
  // TODO: Make these the primary schemas after renaming "teams" back to "groups"
  // in the database.
  'GroupSchema',
  'GroupConfigSchema',
  'GroupRoleSchema',
  'GroupUserSchema',
  'GroupUserRoleSchema',
  'GroupLogSchema',
]);

function tableNameToSchemaName(tableName: string) {
  if (tableName in schemaNameOverrides) {
    return schemaNameOverrides[tableName];
  }
  // Remove trailing 's' if present
  let base = tableName;
  if (base.endsWith('s')) {
    base = base.slice(0, -1);
  }
  // Convert snake_case to PascalCase
  const pascal = base
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return `${pascal}Schema`;
}

describe('Database Schema Sync Test', () => {
  beforeAll(async () => {
    await helperDb.before();
  });

  afterAll(async () => {
    await helperDb.after();
  });

  it('matches Zod schema keys', async () => {
    // Test each table-schema pair
    const dbName = helperDb.getDatabaseNameForCurrentWorker();
    const data = await describeDatabase(dbName);
    const tables = Object.keys(data.tables);
    const usedSchemas = new Set<string>();
    // Skip PrairieTest tables
    const nonPtTables = tables.filter((tableName) => !tableName.startsWith('pt_'));
    for (const tableName of nonPtTables) {
      const schemaName = tableNameToSchemaName(tableName);
      // A null schema name means that the schema should be ignored.
      if (schemaName === null) {
        usedSchemas.add(tableName);
        continue;
      }

      const schema = (DbSchemas as Record<string, unknown>)[schemaName];
      if (schema === undefined) {
        throw new Error(`No schema mapping for table: ${tableName}`);
      }

      usedSchemas.add(schemaName);

      // Skip tables that are marked as 'null'. These mean that the table currently doesn't have a schema,
      // but we may want to add one in the future as needed.
      if (schema === null) {
        continue;
      }

      const dbColumnNames = data.tables[tableName].columns.map((column) => column.name);
      const schemaKeys = Object.keys((schema as z.ZodObject<any>).shape);
      const extraColumns = difference(dbColumnNames, schemaKeys);
      const missingColumns = difference(schemaKeys, dbColumnNames);

      if (extraColumns.length > 0 || missingColumns.length > 0) {
        const extraColumnsDiff = extraColumns.map((column) => `+ ${column}`).join('\n');
        const missingColumnsDiff = missingColumns.map((column) => `- ${column}`).join('\n');
        // throw an error with the diff
        throw new Error(
          `Database columns for table '${tableName}' do not match Zod schema keys.\n` +
            extraColumnsDiff +
            '\n' +
            missingColumnsDiff,
        );
      }
    }

    const remainingSchemas = Object.keys(DbSchemas).filter(
      (schemaName) =>
        schemaName.endsWith('Schema') &&
        !usedSchemas.has(schemaName) &&
        !schemaName.startsWith('Enum') &&
        !schemaName.startsWith('Sproc') &&
        !customSchemas.has(schemaName) &&
        !unusedSchemas.has(schemaName),
    );
    if (remainingSchemas.length > 0) {
      throw new Error(`Unused schemas: ${remainingSchemas.join(', ')}`);
    }

    const remainingTableNames = difference(nonPtTables, TableNames);
    const remainingSchemaNames = difference(TableNames, nonPtTables);
    if (remainingTableNames.length > 0) {
      throw new Error(
        `table definitions missing from TableNames: ${remainingTableNames.join(', ')}`,
      );
    }
    if (remainingSchemaNames.length > 0) {
      throw new Error(
        `tables listed in TableNames but not in database: ${remainingSchemaNames.join(', ')}`,
      );
    }
  });
});
