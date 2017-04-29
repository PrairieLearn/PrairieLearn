require('should');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');
var sql = sqlLoader.loadSqlEquiv(__filename);

var postgresqlUser = 'postgres';

var postgresqlHost = 'localhost';
var initConString = 'postgres://localhost/postgres';

describe('database schemas', () => {
    it('should be the same when constructed from models or migrations', (callback) => {
        let modelsTables, migrationsTables, modelsSchemas, migrationsSchemas;
        async.series([
            (callback) => setupNamedDatabase('models_test', callback),
            (callback) => {
                sqldb.query(sql.get_tables, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    modelsTables = result.rows;
                    callback(null);
                });
            },
            (callback) => tearDownNamedDatabase('models_test', callback),
            (callback) => setupNamedDatabase('migrations_test', callback),
            (callback) => {
                sqldb.query(sql.get_tables, [], function(err, result) {
                    if (ERR(err, callback)) return;
                    migrationsTables = result.rows;
                    callback(null);
                });
            },
            (callback) => tearDownNamedDatabase('migrations_test', callback),
        ], (err) => {
            if (ERR(err, callback)) return;
            console.log(modelsTables);
            console.log(migrationsTables);
            callback(null);
        })
    });
});

function setupNamedDatabase(databaseName, callback) {
    this.timeout(10000);
    var client;
    async.series([
        function(callback) {
            client = new pg.Client(initConString);
            client.connect(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            client.query('DROP DATABASE IF EXISTS ' + databaseName + ';', function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            client.query('CREATE DATABASE ' + databaseName + ';', function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            client.end();
            callback(null);
        },
        function(callback) {
            var pgConfig = {
                user: postgresqlUser,
                database: postgresqlDatabase,
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
            models.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            migrations.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function tearDownNamedDatabase(databaseName, callback) {
    var client;
    async.series([
        function(callback) {
            sqldb.close(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            client = new pg.Client(initConString);
            client.connect(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            client.query('DROP DATABASE IF EXISTS ' + databaseName + ';', function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            client.end();
            callback(null);
        },
    ], function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
}
