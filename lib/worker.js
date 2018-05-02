const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');

const config = require('./config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const logger = require('./logger');
const assessment = require('./assessment');
const externalGrader = require('./externalGrader');
const freeformServer = require('../question-servers/freeform.js');
const question = require('./question');

let workerNumber = null;
const functions = {};

process.on('message', (m) => {
    if (_.has(functions, m.fcn)) {
        functions[m.fcn](m.args, (err, retArgs) => {
            process.send({id: m.id, err, retArgs});
        });
    } else {
        logger.error('worker unknown fcn', m);
        process.exit(2);
    }
});

functions.init = (args, callback) => {
    async.series([
        (callback) => {
            workerNumber = args.n;
            callback(null);
        },
        (callback) => {
            _.assign(config, args.config);
            callback(null);
        },
        (callback) => {
            if (config.logFilename) {
                logger.addFileLogging(config.logFilename + `-${workerNumber}-${process.pid}`);
                logger.verbose('activated file logging: ' + config.logFilename);
            }
            callback(null);
        },
        (callback) => {
            const pgConfig = {
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
            externalGrader.init(assessment, function(err) {
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
    ], function(err) {
        if (err) {
            logger.error(`Error initializing worker ${workerNumber} [${process.pid}]`, err);
            logger.error('Exiting...');
            process.exit(1);
        } else {
            logger.info(`Worker ${workerNumber} [${process.pid}] initialized`);
            callback(null);
        }
    });
};

functions.saveAndGradeSubmission = (args, callback) => {
    question.saveAndGradeSubmission(args.submission, args.variant, args.question, args.course, (err, submission_id) => {
        callback(err, {submission_id});
    });
};
