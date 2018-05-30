const ERR = require('async-stacktrace');
const fs = require('fs');
const async = require('async');
const http = require('http');
const https = require('https');
const blocked = require('blocked-at');
const argv = require('yargs-parser') (process.argv.slice(2));

const logger = require('./lib/logger');
const config = require('./lib/config');
const load = require('./lib/load');
const externalGrader = require('./lib/external-grading/grader');
const externalGradingSocket = require('./lib/external-grading/socket');
const assessment = require('./lib/assessment');
const sqldb = require('@prairielearn/prairielib/sql-db');
const migrations = require('./migrations');
const sprocs = require('./sprocs');
const cron = require('./cron');
const redis = require('./lib/redis');
const socketServer = require('./lib/socket-server');
const serverJobs = require('./lib/server-jobs');
const freeformServer = require('./question-servers/freeform.js');

// If there is only one argument, legacy it into the config option
if (argv['_'].length == 1) {
    argv['config'] = argv['_'][0];
    argv['_'] = [];
}

if ('h' in argv || 'help' in argv) {
    var msg = `PrairieLearn command line options:
    -h, --help                          Display this help and exit
    --config <filename>
    <filename> and no other args        Load an alternative config filename
    --migrate-and-exit                  Run the DB initialization parts and exit
    --exit                              Run all the initialization and exit
`;

    console.log(msg); // eslint-disable-line no-console
    process.exit(0);
}

let server;

module.exports.startHttpServer = function(callback) {
    const app = require('./app')(config);
    if (config.serverType === 'https') {
        var options = {
            key: fs.readFileSync('/etc/pki/tls/private/localhost.key'),
            cert: fs.readFileSync('/etc/pki/tls/certs/localhost.crt'),
            ca: [fs.readFileSync('/etc/pki/tls/certs/server-chain.crt')],
        };
        server = https.createServer(options, app);
        server.listen(config.serverPort);
        logger.verbose('server listening to HTTPS on port ' + config.serverPort);
        callback(null);
    } else if (config.serverType === 'http') {
        server = http.createServer(app);
        server.listen(config.serverPort);
        logger.verbose('server listening to HTTP on port ' + config.serverPort);
        callback(null);
    } else {
        callback('unknown serverType: ' + config.serverType);
    }
};

module.exports.stopHttpServer = function(callback) {
    if (!server) return callback(new Error('cannot stop an undefined server'));
    server.close(function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

module.exports.insertDevUser = function(callback) {
    // add dev user as Administrator
    var sql
        = 'INSERT INTO users (uid, name)'
        + ' VALUES (\'dev@illinois.edu\', \'Dev User\')'
        + ' ON CONFLICT (uid) DO UPDATE'
        + ' SET name = EXCLUDED.name'
        + ' RETURNING user_id;';
    sqldb.queryOneRow(sql, [], function(err, result) {
        if (ERR(err, callback)) return;
        var user_id = result.rows[0].user_id;
        var sql
            = 'INSERT INTO administrators (user_id)'
            + ' VALUES ($user_id)'
            + ' ON CONFLICT (user_id) DO NOTHING;';
        var params = {user_id};
        sqldb.query(sql, params, function(err, _result) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });
};

module.exports.startServer = function() {
    logger.info('PrairieLearn server start');

    async.series([
        function(callback) {
            const configFilename = argv['config'] || 'config.json';
            config.loadConfig(configFilename, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            // This stuff is dependent on config, so wait for config to be
            // loaded first
            if (config.logFilename) {
                logger.addFileLogging(config.logFilename);
                logger.verbose('activated file logging: ' + config.logFilename);
            }

            if (config.blockedWarnEnable) {
                blocked((time, stack) => {
                    const msg = `BLOCKED-AT: Blocked for ${time}ms`;
                    logger.verbose(msg, {stack});
                    console.log(msg + '\n' + stack.join('\n')); // eslint-disable-line no-console
                }, {threshold: config.blockedWarnThresholdMS}); // threshold in milliseconds
            }
            callback(null);
        },
        function(callback) {
            var pgConfig = {
                user: config.postgresqlUser,
                database: config.postgresqlDatabase,
                host: config.postgresqlHost,
                password: config.postgresqlPassword,
                max: 100,
                idleTimeoutMillis: 30000,
            };
            logger.verbose('Connecting to database ' + pgConfig.user + '@' + pgConfig.host + ':' + pgConfig.database);
            var idleErrorHandler = function(err) {
                logger.error('idle client error', err);
            };
            sqldb.init(pgConfig, idleErrorHandler, function(err) {
                if (ERR(err, callback)) return;
                logger.verbose('Successfully connected to database');
                callback(null);
            });
        },
        function(callback) {
            migrations.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            sprocs.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            if ('migrate-and-exit' in argv && argv['migrate-and-exit']) {
                logger.info('option --migrate-and-exit passed, running DB setup and exiting');
                process.exit(0);
            } else {
                callback(null);
            }
        },
        function(callback) {
            cron.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            redis.init((err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            externalGrader.init(assessment, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            if (!config.devMode) return callback(null);
            module.exports.insertDevUser(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            load.initEstimator('request', 1);
            load.initEstimator('authed_request', 1);
            load.initEstimator('python', 1);
            callback(null);
        },
        function(callback) {
            logger.verbose('Starting server...');
            module.exports.startHttpServer(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            socketServer.init(server, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            externalGradingSocket.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            serverJobs.init(function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            freeformServer.init(function(err) {
              if (ERR(err, callback)) return;
              callback(null);
          });
        },
    ], function(err, data) {
        if (err) {
            logger.error('Error initializing PrairieLearn server:', err, data);
            logger.error('Exiting...');
            process.exit(1);
        } else {
            logger.info('PrairieLearn server ready');
            if (config.devMode) {
                logger.info('Go to ' + config.serverType + '://localhost:' + config.serverPort + '/pl');
            }
            if ('exit' in argv) { logger.info('exit option passed, quitting...'); process.exit(0); }
        }
    });
};

if (require.main === module) {
    // We're the entrypoint script to the process, i.e., not being required by
    // another module. Let's start the server!
    module.exports.startServer();
}
