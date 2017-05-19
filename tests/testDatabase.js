var ERR = require('async-stacktrace');
var async = require('async');
var pg = require('pg');
var assert = require('chai').assert;
var colors = require('colors');

var databaseDiff = require('../lib/databaseDiff');
var migrations = require('../migrations');
var helperDb = require('./helperDb');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var postgresqlUser = 'postgres';
var postgresqlHost = 'localhost';
var initConString = 'postgres://localhost/postgres';


// Custom error type so we can display our own message and omit a stacktrace
function DatabaseError(message) {
  this.name = 'DatabaseError';
  this.message = message;
}
DatabaseError.prototype = Object.create(Error.prototype);
DatabaseError.prototype.constructor = DatabaseError;

describe('database', function() {

    before('set up testing database', helperDb.beforeOnlyCreate);
    after('tear down testing database', helperDb.after);

    it('should match the database described in /database', function(done) {
        this.timeout(10000);
        let results = '';
        let errMsg = '';
        const options = {
            outputFormat: 'string',
            coloredOutput: process.stdout.isTTY,
        };
        databaseDiff.diffDirectoryAndDatabase('database', 'pltest', options, (err, data) => {
            if (ERR(err, done)) return;
            data ? done(new DatabaseError('\n'.red + data)) : done(null);
        });
    });
});
