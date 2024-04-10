// @ts-check
import chalk from 'chalk';
import { parse as parsePostgresArray } from 'postgres-array';
import { loadSqlEquiv, PostgresPool } from '@prairielearn/postgres';

const sql = loadSqlEquiv(__filename);

interface ColumnDescription {
  name: string;
  type: string;
  notnull: boolean;
  default: any;
}

interface IndexDescription {
  name: string;
  isprimary: boolean;
  isunique: boolean;
  indexdef: string;
  constraintdef: string;
  contype: string;
}

interface ForeignKeyConstraintDescription {
  name: string;
  def: string;
}

interface ReferenceDescription {
  name: string;
  table: string;
  condef: string;
}

interface CheckConstraintDescription {
  name: string;
  def: string;
}

interface TableDescription {
  columns: ColumnDescription[];
  indexes: IndexDescription[];
  foreignKeyConstraints: ForeignKeyConstraintDescription[];
  references: ReferenceDescription[];
  checkConstraints: CheckConstraintDescription[];
}

export interface DatabaseDescription {
  tables: Record<string, TableDescription>;
  enums: Record<string, string[]>;
}

interface DescribeOptions {
  ignoreTables?: string[];
  ignoreColumns?: string[];
  ignoreEnums?: string[];
}

async function describeWithPool(
  pool: PostgresPool,
  options: DescribeOptions,
): Promise<DatabaseDescription> {
  const ignoreTables = options?.ignoreTables || [];
  const ignoreEnums = options?.ignoreEnums || [];
  let ignoreColumns: Record<string, string[]> = {};

  const output: DatabaseDescription = {
    tables: {},
    enums: {},
  };

  // Get the names of the tables and filter out any ignored tables
  const tablesRes = await pool.queryAsync(sql.get_tables, []);
  const tables = tablesRes.rows.filter((table) => ignoreTables.indexOf(table.name) === -1);

  // Transform ignored columns into a map from table names to arrays
  // of column names
  if (options.ignoreColumns && Array.isArray(options.ignoreColumns)) {
    ignoreColumns = options.ignoreColumns
      .filter((ignore) => {
        return /^[^\s.]*\.[^\s.]*$/.test(ignore);
      })
      .reduce(
        (result, value) => {
          const res = /^(([^\s.]*)\.([^\s.]*))$/.exec(value);
          if (!res) {
            throw new Error(`Invalid ignore column: ${value}`);
          }
          const table = res[2];
          const column = res[3];
          (result[table] || (result[table] = [])).push(column);
          return result;
        },
        {} as Record<string, string[]>,
      );
  }

  // Get column info for each table
  for (const table of tables) {
    const columnResults = await pool.queryAsync(sql.get_columns_for_table, {
      oid: table.oid,
    });

    const columns = columnResults.rows.filter((row) => {
      return (ignoreColumns[table.name] || []).indexOf(row.name) === -1;
    });

    const indexResults = await pool.queryAsync(sql.get_indexes_for_table, {
      oid: table.oid,
    });

    const foreignKeyConstraintResults = await pool.queryAsync(
      sql.get_foreign_key_constraints_for_table,
      {
        oid: table.oid,
      },
    );

    const referenceResults = await pool.queryAsync(sql.get_references_for_table, {
      oid: table.oid,
    });

    // Filter out references from ignored tables
    const references = referenceResults.rows.filter((row) => {
      return ignoreTables.indexOf(row.table) === -1;
    });

    const checkConstraintResults = await pool.queryAsync(sql.get_check_constraints_for_table, {
      oid: table.oid,
    });

    output.tables[table.name] = {
      columns,
      indexes: indexResults.rows,
      foreignKeyConstraints: foreignKeyConstraintResults.rows,
      references,
      checkConstraints: checkConstraintResults.rows,
    };
  }

  // Get all enums
  const enumsRes = await pool.queryAsync(sql.get_enums, []);

  // Filter ignored enums
  const rows = enumsRes.rows.filter((row) => {
    return ignoreEnums.indexOf(row.name) === -1;
  });

  rows.forEach((row) => {
    output.enums[row.name] = parsePostgresArray(row.values);
  });

  return output;
}

/**
 * Will produce a description of a given database's schema. This will include
 * information about tables, enums, constraints, indices, etc.
 */
export async function describeDatabase(
  databaseName: string,
  options: DescribeOptions = {},
): Promise<DatabaseDescription> {
  // Connect to the database.
  const pool = new PostgresPool();
  const pgConfig = {
    user: 'postgres',
    database: databaseName,
    host: 'localhost',
    max: 10,
    idleTimeoutMillis: 30000,
  };
  function idleErrorHandler(err: Error) {
    throw err;
  }
  await pool.initAsync(pgConfig, idleErrorHandler);

  try {
    return await describeWithPool(pool, options);
  } finally {
    await pool.closeAsync();
  }
}

export function formatDatabaseDescription(
  description: DatabaseDescription,
  options = { coloredOutput: true },
): { tables: Record<string, string>; enums: Record<string, string> } {
  const output = {
    tables: {} as Record<string, string>,
    enums: {} as Record<string, string>,
  };

  Object.keys(description.tables).forEach((tableName) => (output.tables[tableName] = ''));

  /**
   * Optionally applies the given formatter to the text if colored output is
   * enabled.
   */
  function formatText(text: string, formatter: (s: string) => string): string {
    if (options.coloredOutput) {
      return formatter(text);
    }
    return text;
  }

  Object.entries(description.tables).forEach(([tableName, table]) => {
    if (table.columns.length > 0) {
      output.tables[tableName] += formatText('columns\n', chalk.underline);
      output.tables[tableName] += table.columns
        .map((row) => {
          let rowText = formatText(`    ${row.name}`, chalk.bold);
          rowText += ':' + formatText(` ${row.type}`, chalk.green);
          if (row.notnull) {
            rowText += formatText(' not null', chalk.gray);
          }
          if (row.default) {
            rowText += formatText(` default ${row.default}`, chalk.gray);
          }
          return rowText;
        })
        .join('\n');
    }

    if (table.indexes.length > 0) {
      if (output.tables[tableName].length !== 0) {
        output.tables[tableName] += '\n\n';
      }
      output.tables[tableName] += formatText('indexes\n', chalk.underline);
      output.tables[tableName] += table.indexes
        .map((row) => {
          const using = row.indexdef.substring(row.indexdef.indexOf('USING '));
          let rowText = formatText(`    ${row.name}`, chalk.bold) + ':';
          // Primary indexes are implicitly unique, so we don't need to
          // capture that explicitly.
          if (row.isunique && !row.isprimary) {
            if (!row.constraintdef || row.constraintdef.indexOf('UNIQUE') === -1) {
              // Some unique indexes don't include the UNIQUE constraint
              // as part of the constraint definition, so we need to capture
              // that manually.
              rowText += formatText(` UNIQUE`, chalk.green);
            }
          }
          rowText += row.constraintdef ? formatText(` ${row.constraintdef}`, chalk.green) : '';
          rowText += using ? formatText(` ${using}`, chalk.green) : '';
          return rowText;
        })
        .join('\n');
    }

    if (table.checkConstraints.length > 0) {
      if (output.tables[tableName].length !== 0) {
        output.tables[tableName] += '\n\n';
      }
      output.tables[tableName] += formatText('check constraints\n', chalk.underline);
      output.tables[tableName] += table.checkConstraints
        .map((row) => {
          // Particularly long constraints are formatted as multiple lines.
          // We'll collapse them into a single line for better appearance in
          // the resulting file.
          //
          // The first replace handles lines that end with a parenthesis: we
          // want to avoid spaces between the parenthesis and the next token.
          //
          // The second replace handles all other lines: we want to collapse
          // all leading whitespace into a single space.
          const def = row.def.replace(/\(\n/g, '(').replace(/\n\s*/g, ' ');

          let rowText = formatText(`    ${row.name}:`, chalk.bold);
          rowText += formatText(` ${def}`, chalk.green);
          return rowText;
        })
        .join('\n');
    }

    if (table.foreignKeyConstraints.length > 0) {
      if (output.tables[tableName].length !== 0) {
        output.tables[tableName] += '\n\n';
      }
      output.tables[tableName] += formatText('foreign-key constraints\n', chalk.underline);
      output.tables[tableName] += table.foreignKeyConstraints
        .map((row) => {
          let rowText = formatText(`    ${row.name}:`, chalk.bold);
          rowText += formatText(` ${row.def}`, chalk.green);
          return rowText;
        })
        .join('\n');
    }

    if (table.references.length > 0) {
      if (output.tables[tableName].length !== 0) {
        output.tables[tableName] += '\n\n';
      }
      output.tables[tableName] += formatText('referenced by\n', chalk.underline);
      output.tables[tableName] += table.references
        ?.map((row) => {
          let rowText = formatText(`    ${row.table}:`, chalk.bold);
          rowText += formatText(` ${row.condef}`, chalk.green);
          return rowText;
        })
        .join('\n');
    }
  });

  Object.entries(description.enums).forEach(([enumName, enumValues]) => {
    output.enums[enumName] = formatText(enumValues.join(', '), chalk.gray);
  });

  // We need to tack on a newline to everything.
  Object.entries(output.tables).forEach(([tableName, table]) => {
    output.tables[tableName] = table + '\n';
  });
  Object.entries(output.enums).forEach(([enumName, enumValues]) => {
    output.enums[enumName] = enumValues + '\n';
  });

  return output;
}
