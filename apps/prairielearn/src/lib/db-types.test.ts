import _ from 'lodash';
import { afterAll, beforeAll, describe, it } from 'vitest';
import type z from 'zod';

import { describeDatabase } from '@prairielearn/postgres-tools';

import * as helperDb from '../tests/helperDb.js';

import * as DbSchemas from './db-types.js';

const schemaNameOverrides = {
  // https://github.com/PrairieLearn/PrairieLearn/issues/12428
  courses: null,
  pl_courses: 'CourseSchema',
  last_accesses: 'LastAccessSchema',
  query_runs: 'QueryRunSchema',
  time_series: 'TimeSeriesSchema',
};

const customSchemas = ['IdSchema', 'IntervalSchema'];
const unusedSchemas = ['AssessmentsFormatForQuestionSchema', 'JsonCommentSchema', 'QueryRunSchema'];

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
    for (const tableName of tables) {
      // Skip PrairieTest tables
      if (tableName.startsWith('pt_')) {
        continue;
      }

      const schemaName = tableNameToSchemaName(tableName);
      // A null schema name means that the schema should be ignored.
      if (schemaName === null) {
        usedSchemas.add(tableName);
        continue;
      }

      const schema = DbSchemas[schemaName as keyof typeof DbSchemas];
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
      const extraColumns = _.difference(dbColumnNames, schemaKeys);
      const missingColumns = _.difference(schemaKeys, dbColumnNames);

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
        !customSchemas.includes(schemaName) &&
        !unusedSchemas.includes(schemaName),
    );
    if (remainingSchemas.length > 0) {
      throw new Error(`Unused schemas: ${remainingSchemas.join(', ')}`);
    }
  });
});
