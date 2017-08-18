var ERR = require('async-stacktrace');

var databaseDiff = require('../lib/databaseDiff');
var helperDb = require('./helperDb');

// Custom error type so we can display our own message and omit a stacktrace
function DatabaseError(message) {
  this.name = 'DatabaseError';
  this.message = message;
}
DatabaseError.prototype = Object.create(Error.prototype);
DatabaseError.prototype.constructor = DatabaseError;

describe('database', function() {
    this.timeout(5000);

    before('set up testing database', helperDb.beforeOnlyCreate);
    after('tear down testing database', helperDb.after);

    it('should match the database described in /database', function(done) {
        this.timeout(10000);
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
