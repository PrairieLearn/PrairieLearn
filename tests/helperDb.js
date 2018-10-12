var ERR = require('async-stacktrace');
var async = require('async');
var pg = require('pg');
var path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const _ = require('lodash');

var sqldb = require('@prairielearn/prairielib/sql-db');
var migrations = require('../migrations');
var sprocs = require('../sprocs');

var postgresqlUser = 'postgres';
var postgresqlDatabase = 'pltest';
var postgresqlDatabaseTemplate = 'pltest_template';
var postgresqlHost = 'localhost';
var initConString = 'postgres://postgres@localhost/postgres';

var createFullDatabase = function(dbName, dropFirst, mochaThis, callback) {
    debug(`createFullDatabase(${dbName})`);
    // long timeout because DROP DATABASE might take a long time to error
    // if other processes have an open connection to that database
    mochaThis.timeout(20000);
    var client;
    async.series([
        function(callback) {
            debug('createFullDatabase(): connecting client');
            client = new pg.Client(initConString);
            client.connect(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            if (dropFirst) {
                debug('createFullDatabase(): dropping database');
                client.query('DROP DATABASE IF EXISTS ' + dbName + ';', function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            } else {
                callback(null);
            }
        },
        function(callback) {
            debug('createFullDatabase(): creating database');
            client.query('CREATE DATABASE ' + dbName + ';', function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            debug('createFullDatabase(): ending client');
            client.end();
            callback(null);
        },
        function(callback) {
            debug('createFullDatabase(): initializing sqldb');
            var pgConfig = {
                user: postgresqlUser,
                database: dbName,
                host: postgresqlHost,
                max: 10,
                idleTimeoutMillis: 30000,
            };
            var idleErrorHandler = function(err) {
                throw Error('idle client error', err);
            };
            sqldb.init(pgConfig, idleErrorHandler, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            debug('createFullDatabase(): running migrations');
            migrations.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            debug('createFullDatabase(): initializing sprocs');
            sprocs.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            debug('createFullDatabase(): closing sqldb');
            sqldb.close(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], function(err) {
        debug('createFullDatabase(): complete');
        if (ERR(err, callback)) return;
        callback(null);
    });
};

var createFromTemplate = function(dbName, dbTemplateName, dropFirst, mochaThis, callback) {
    debug(`createFromTemplate(${dbName}, ${dbTemplateName})`);
    // long timeout because DROP DATABASE might take a long time to error
    // if other processes have an open connection to that database
    mochaThis.timeout(20000);
    var client;
    async.series([
        function(callback) {
            debug('createFromTemplate(): connecting client');
            client = new pg.Client(initConString);
            client.connect(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            if (dropFirst) {
                debug('createFromTemplate(): dropping database');
                client.query('DROP DATABASE IF EXISTS ' + dbName + ';', function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            } else {
                callback(null);
            }
        },
        function(callback) {
            debug('createFromTemplate(): creating database');
            client.query(`CREATE DATABASE ${dbName} TEMPLATE ${dbTemplateName};`, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            debug('createFromTemplate(): ending client');
            client.end();
            callback(null);
        },
    ], function(err) {
        debug('createFromTemplate(): complete');
        if (ERR(err, callback)) return;
        callback(null);
    });
};

var establishSql = function(dbName, callback) {
    debug(`establishSql(${dbName})`);
    debug('establishSql(): initializing sqldb');
    var pgConfig = {
        user: postgresqlUser,
        database: dbName,
        host: postgresqlHost,
        max: 10,
        idleTimeoutMillis: 30000,
    };
    var idleErrorHandler = function(err) {
        throw Error('idle client error', err);
    };
    sqldb.init(pgConfig, idleErrorHandler, function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

var closeSql = function(callback) {
    debug(`closeSql()`);
    debug('closeSql(): closing sqldb');
    sqldb.close(function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

var dropDatabase = function(dbName, mochaThis, callback, forceDrop=false) {
    debug(`dropDatabase(${dbName})`);
    if (_.has(process.env, 'PL_KEEP_TEST_DB') && !forceDrop) {
        // eslint-disable-next-line no-console
        console.log(`PL_KEEP_TEST_DB enviroment variable set, not dropping database ${dbName}`);
        return callback(null);
    }
    // long timeout because DROP DATABASE might take a long time to error
    // if other processes have an open connection to that database
    mochaThis.timeout(20000);
    var client;
    async.series([
        function(callback) {
            debug('dropDatabase(): connecting client');
            client = new pg.Client(initConString);
            client.connect(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            debug('dropDatabase(): dropping database');
            client.query('DROP DATABASE IF EXISTS ' + dbName + ';', function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            debug('dropDatabase(): ending client');
            client.end();
            callback(null);
        },
    ], function(err) {
        debug('dropDatabase(): complete');
        if (ERR(err, callback)) return;
        callback(null);
    });
};

var databaseExists = function(dbName, callback) {
    debug(`databaseExists(${dbName})`);
    var existsResult = null;
    var client;
    async.series([
        function(callback) {
            debug('databaseExists(): connecting client');
            client = new pg.Client(initConString);
            client.connect(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            debug('databaseExists(): running query');
            client.query(
                `SELECT exists(SELECT * FROM pg_catalog.pg_database WHERE datname = '${dbName}');`,
                function (err, result) {
                    if (ERR(err, callback)) return;
                    existsResult = result.rows[0].exists;
                    callback(null);
            });
        },
        function(callback) {
            debug('databaseExists(): ending client');
            client.end();
            callback(null);
        },
    ], function(err) {
        debug('databaseExists(): complete returning ' + existsResult);
        if (ERR(err, callback)) return;
        callback(null, existsResult);
    });
};

var setupDatabases = function(mochaThis, callback) {
    debug(`setupDatabases()`);
    databaseExists(postgresqlDatabaseTemplate, (err, result) => {
        if (ERR(err, callback));
        if (result) {
            createFromTemplate(postgresqlDatabase, postgresqlDatabaseTemplate, true, mochaThis, function(err) {
                if (ERR(err, callback)) return;
                establishSql(postgresqlDatabase, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        } else {
            createFullDatabase(postgresqlDatabaseTemplate, true, mochaThis, function(err) {
                if (ERR(err, callback)) return;
                createFromTemplate(postgresqlDatabase, postgresqlDatabaseTemplate, true, mochaThis, function(err) {
                    if (ERR(err, callback)) return;
                    establishSql(postgresqlDatabase, function(err) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            });
        }
    });
};

module.exports = {

    before: function(callback) {
        debug(`before()`);
        var that = this;
        setupDatabases(that, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    // This version will only (re)create the database with migrations; it will
    // then close the connection in sqldb. This is necessary for database
    // schema verification, where databaseDiff will set up a connection to the
    // desired database.
    beforeOnlyCreate: function(callback) {
        debug(`beforeOnlyCreate()`);
        var that = this;
        setupDatabases(that, (err) => {
            if (ERR(err, callback)) return;
            closeSql((err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },

    after: function(callback) {
        debug(`after()`);
        var that = this;
        closeSql(function(err) {
            if (ERR(err, callback)) return;
            dropDatabase(postgresqlDatabase, that, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },

    dropTemplate: function(callback) {
        debug(`dropTemplate()`);
        var that = this;
        closeSql(function(err) {
            if (ERR(err, callback)) return;
            dropDatabase(postgresqlDatabaseTemplate, that, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            }, true); // add flag to always drop the template regardless of PL_KEEP_TEST_DB env
        });
    },
};
