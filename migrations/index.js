var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var async = require('async');
var pg = require('pg');

var error = require('../lib/error');
var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');

var migrationFiles = fs
    .readdirSync(__dirname)
    .filter(file => /^.+\.sql$/.test(file))
    .sort();

module.exports = {
    init: function(callback) {
        logger.verbose('Starting DB schema migration');
        async.eachSeries(
            migrationFiles,
            function(filename, callback) {
                logger.verbose('Loading ' + filename);
                fs.readFile(path.join(__dirname, filename), 'utf8', function(err, sql) {
                    sqldb.query(sql, [], function(err) {
                        if (err) error.addData(err, {sqlFile: filename});
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            },
            function(err) {
                if (ERR(err, callback)) return;
                logger.verbose('Successfully completed DB schema migration');
                callback(null);
            }
        );
    },
};
