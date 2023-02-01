// @ts-check
const async = require('async');
const pgArray = require('pg').types.arrayParser;
const chalk = require('chalk');
const _ = require('lodash');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

/**
 * @typedef {Object} ColumnDescription
 * @property {string} name
 * @property {string} type
 * @property {boolean} notnull
 * @property {any} default
 */

/**
 * @typedef {Object} IndexDescription
 * @property {string} name
 * @property {boolean} isprimary
 * @property {boolean} isunique
 * @property {string} indexdef
 * @property {string} constraintdef
 * @property {string} contype
 */

/**
 * @typedef {Object} ForeignKeyConstraintDescription
 * @property {string} name
 * @property {string} def
 */

/**
 * @typedef {Object} ReferenceDescription
 * @property {string} name
 * @property {string} table
 * @property {string} condef
 */

/**
 * @typedef {Object} TableDescription
 * @property {ColumnDescription[]} columns
 * @property {IndexDescription[]} indexes
 * @property {ForeignKeyConstraintDescription[]} foreignKeyConstraints
 * @property {ReferenceDescription[]} references
 */

/**
 * @typedef {Object} DatabaseDescription
 * @property {Record<string, TableDescription>} tables
 * @property {Record<string, string[]>} enums
 */

/**
 * @typedef {Object} DescribeOptions
 * @property {string[]} [ignoreTables]
 * @property {string[]} [ignoreColumns]
 * @property {string[]} [ignoreEnums]
 */

/**
 * Will produce a description of a given database's schema. This will include
 * information about tables, enums, constraints, indices, etc.
 *
 * @param {string} databaseName
 * @param {DescribeOptions} [options]
 * @returns {Promise<DatabaseDescription>}
 */
module.exports.describe = async function (databaseName, options = {}) {
  var ignoreColumns = {};

  var output = {
    tables: {},
    enums: {},
  };

  // Connect to the database
  const pgConfig = {
    user: 'postgres',
    database: databaseName,
    host: 'localhost',
    max: 10,
    idleTimeoutMillis: 30000,
  };
  function idleErrorHandler(err) {
    throw err;
  }
  await sqldb.initAsync(pgConfig, idleErrorHandler);

  // Get the names of the tables
  const tablesRes = await sqldb.queryAsync(sql.get_tables, []);
  let tables = tablesRes.rows;

  // Filter out ignored tables
  if (options.ignoreTables && _.isArray(options.ignoreTables)) {
    tables = _.filter(tables, (table) => options.ignoreTables.indexOf(table.name) === -1);
  }

  tables.forEach((table) => (output.tables[table.name] = {}));

  // Transform ignored columns into a map from table names to arrays
  // of column names
  if (options.ignoreColumns && _.isArray(options.ignoreColumns)) {
    ignoreColumns = _.filter(options.ignoreColumns, (ignore) => {
      return /^[^\s.]*\.[^\s.]*$/.test(ignore);
    });
    ignoreColumns = _.reduce(
      ignoreColumns,
      (result, value) => {
        var res = /^(([^\s.]*)\.([^\s.]*))$/.exec(value);
        var table = res[2];
        var column = res[3];
        (result[table] || (result[table] = [])).push(column);
        return result;
      },
      {}
    );
  }

  // Get column info for each table
  await async.each(tables, async (table) => {
    await async.series([
      async () => {
        const results = await sqldb.queryAsync(sql.get_columns_for_table, {
          oid: table.oid,
        });

        const rows = _.filter(results.rows, (row) => {
          return (ignoreColumns[table.name] || []).indexOf(row.name) === -1;
        });

        output.tables[table.name].columns = rows;
      },
      async () => {
        const results = await sqldb.queryAsync(sql.get_indexes_for_table, {
          oid: table.oid,
        });

        output.tables[table.name].indexes = results.rows;
      },
      async () => {
        const results = await sqldb.queryAsync(sql.get_foreign_key_constraints_for_table, {
          oid: table.oid,
        });

        output.tables[table.name].foreignKeyConstraints = results.rows;
      },
      async () => {
        const results = await sqldb.queryAsync(sql.get_references_for_table, {
          oid: table.oid,
        });

        // Filter out references from ignored tables
        let rows = results.rows;
        if (options.ignoreTables && _.isArray(options.ignoreTables)) {
          rows = _.filter(results.rows, (row) => {
            return options.ignoreTables.indexOf(row.table) === -1;
          });
        }

        output.tables[table.name].references = rows;
      },
    ]);
  });

  // Get all enums
  const enumsRes = await sqldb.queryAsync(sql.get_enums, []);

  // Filter ignored enums
  let rows = enumsRes.rows;
  if (options.ignoreEnums && _.isArray(options.ignoreEnums)) {
    rows = _.filter(enumsRes.rows, (row) => {
      return options.ignoreEnums.indexOf(row.name) === -1;
    });
  }

  rows.forEach((row) => {
    output.enums[row.name] = pgArray.create(row.values, String).parse();
  });

  await sqldb.closeAsync();
  return output;
};

/**
 *
 * @param {DatabaseDescription} description
 * @param {{ coloredOutput: boolean }} options
 * @returns {{ tables: Record<string, string>, enums: Record<string, string> }}
 */
module.exports.formatDescription = function (description, options = { coloredOutput: true }) {
  const output = {
    tables: {},
    enums: {},
  };

  Object.keys(description.tables).forEach((tableName) => (output.tables[tableName] = ''));

  /**
   * Optionally applies the given formatter to the text if colored output is
   * enabled.
   *
   * @param {string} text
   * @param {(s: string) => string} formatter
   * @returns {string}
   */
  function formatText(text, formatter) {
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
          var rowText = formatText(`    ${row.name}`, chalk.bold);
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
          var rowText = formatText(`    ${row.name}`, chalk.bold) + ':';
          // Primary indexes are implicitly unique, so we don't need to
          // capture that explicitly.
          if (row.isunique && !row.isprimary) {
            if (!row.constraintdef || row.constraintdef.indexOf('UNIQUE') === -1) {
              // Some unique indexes don't incldue the UNIQUE constraint
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

    if (table.foreignKeyConstraints.length > 0) {
      if (output.tables[tableName].length !== 0) {
        output.tables[tableName] += '\n\n';
      }
      output.tables[tableName] += formatText('foreign-key constraints\n', chalk.underline);
      output.tables[tableName] += table.foreignKeyConstraints
        .map((row) => {
          var rowText = formatText(`    ${row.name}:`, chalk.bold);
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
          var rowText = formatText(`    ${row.table}:`, chalk.bold);
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
  output.tables = _.mapValues(output.tables, (item) => item + '\n');
  output.enums = _.mapValues(output.enums, (item) => item + '\n');

  return output;
};
