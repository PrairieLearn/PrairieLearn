const ERR = require('async-stacktrace');
const _ = require('lodash');

const databaseDiff = require('../lib/databaseDiff');
const databaseDescribe = require('../lib/databaseDescribe');
const helperDb = require('./helperDb');

// Custom error type so we can display our own message and omit a stacktrace
function DatabaseError(message) {
  this.name = 'DatabaseError';
  this.message = message;
}
DatabaseError.prototype = Object.create(Error.prototype);
DatabaseError.prototype.constructor = DatabaseError;

describe('database', function () {
  this.timeout(20000);

  before('set up testing database', helperDb.beforeOnlyCreate);
  after('tear down testing database', helperDb.after);

  it('should match the database described in /database', function (done) {
    this.timeout(20000);
    const options = {
      outputFormat: 'string',
      coloredOutput: process.stdout.isTTY,
    };
    databaseDiff.diffDirectoryAndDatabase('database', 'pltest', options, (err, data) => {
      if (ERR(err, done)) return;
      data ? done(new DatabaseError('\n'.red + data)) : done(null);
    });
  });
  it('should not contain "ON DELETE CASCADE" foreign keys from soft-delete to hard-delete tables', function (done) {
    /*
     * The bad case is:
     * - Table A should only be soft-deleted (that is, it has a `deleted_at` column)
     * - Table B will be hard-deleted (does not have a `deleted_at` column)
     * - Foreign key from A to B, with ON DELETE CASCADE
     *
     * The problem occurs when we delete a row in table B. This
     * then automatically deletes the row in A, even though we
     * wanted to have the row in A be soft-deleted.
     *
     * See https://github.com/PrairieLearn/PrairieLearn/issues/2256 for a bug caused by this problem.
     */
    const options = {
      databaseName: 'pltest',
      outputFormat: 'object',
    };
    databaseDescribe.describe(options, (err, data) => {
      if (ERR(err, done)) return;

      const tableHasDeletedAtColumn = (table) =>
        _.some(data.tables[table].columns, { name: 'deleted_at' });
      const [softDeleteTables, hardDeleteTables] = _.partition(
        _.keys(data.tables),
        tableHasDeletedAtColumn
      );

      for (const table of softDeleteTables) {
        for (const constraint of data.tables[table].foreignKeyConstraints) {
          const match = constraint.def.match(
            /^FOREIGN KEY \((.*)\) REFERENCES (.*)\(.*\) ON UPDATE .* ON DELETE (.*)$/
          );
          if (!match) {
            return done(new Error(`Failed to match foreign key for ${table}: ${constraint.def}`));
          }
          const [, keyName, otherTable, deleteAction] = match;
          if (deleteAction === 'CASCADE' && _.includes(hardDeleteTables, otherTable)) {
            return done(
              new Error(
                `Soft-delete table "${table}" has ON DELETE CASCADE foreign key "${keyName}" to hard-delete table "${otherTable}"`
              )
            );
          }
        }
      }
      done(null);
    });
  });
});
