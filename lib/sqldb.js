var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var async = require('async');
var pg = require('pg');

var error = require('./error');

module.exports = {
    pool: null,

    init: function(pgConfig, idleErrorHandler, callback) {
        try {
            this.pool = new pg.Pool(pgConfig);
        } catch (err) {
            error.addData(err, {pgConfig: pgConfig});
            callback(err);
        }
        this.pool.on('error', function(err, client) {
            idleErrorHandler(err, client);
        });

        callback(null);
    },

    close: function(callback) {
        this.pool.end(function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    paramsToArray: function(sql, params, callback) {
        if (!_.isString(sql)) return callback(new Error('SQL must be a string'));
        if (_.isArray(params)) return callback(null, sql, params);
        if (!_.isObjectLike(params)) return callback(new Error("params must be array or object"));
        var re = /\$([-_a-zA-Z0-9]+)/;
        var result;
        var processedSql = '';
        var remainingSql = sql;
        var nParams = 0;
        var map = {};
        var paramsArray = [];
        while ((result = re.exec(remainingSql)) !== null) {
            var v = result[1];
            if (!_(map).has(v)) {
                if (!_(params).has(v)) return callback(new Error("Missing parameter: " + v));
                if (_.isArray(params[v])) {
                    map[v] = 'ARRAY[' + _.map(_.range(nParams + 1, nParams + params[v].length + 1), function(n) {return '$' + n;}).join(',') + ']';
                    nParams += params[v].length;
                    paramsArray = paramsArray.concat(params[v]);
                } else {
                    nParams++;
                    map[v] = '$' + nParams;
                    paramsArray.push(params[v]);
                }
            }
            processedSql += remainingSql.substring(0, result.index) + map[v];
            remainingSql = remainingSql.substring(result.index + result[0].length);
        }
        processedSql += remainingSql;
        remainingSql = '';
        callback(null, processedSql, paramsArray);
    },

    getClient: function(callback) {
        this.pool.connect(function(err, client, done) {
            if (err) {
                if (client) {
                    done(client);
                }
                return ERR(err, callback); // unconditionally return
            }
            callback(null, client, done);
        });
    },

    queryWithClient: function(client, sql, params, callback) {
        this.paramsToArray(sql, params, function(err, newSql, newParams) {
            if (err) err = error.addData(err, {sql: sql, params: params});
            if (ERR(err, callback)) return;
            client.query(newSql, newParams, function(err, result) {
                if (err) err = error.addData(err, {sql: sql, params: params, result: result});
                if (ERR(err, callback)) return;
                callback(null, result);
            });
        });
    },

    queryWithClientOneRow: function(client, sql, params, callback) {
        this.queryWithClient(client, sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount !== 1) {
                var data = {sql: sql, params: params, result: result};
                return callback(error.makeWithData("Incorrect rowCount: " + result.rowCount, data));
            }
            callback(null, result);
        });
    },

    releaseClient: function(client, done) {
        done();
    },

    rollbackWithClient: function(client, done, callback) {
        // from https://github.com/brianc/node-postgres/wiki/Transactions
        client.query('ROLLBACK;', function(err) {
            //if there was a problem rolling back the query
            //something is seriously messed up.  Return the error
            //to the done function to close & remove this client from
            //the pool.  If you leave a client in the pool with an unaborted
            //transaction weird, hard to diagnose problems might happen.
            done(err);
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    // get a client and start a transaction
    beginTransaction: function(callback) {
        var that = this;
        that.getClient(function(err, client, done) {
            if (ERR(err, callback)) return;
            that.queryWithClient(client, 'START TRANSACTION;', [], function(err) {
                if (err) {
                    that.rollbackWithClient(client, done, function(rollbackErr) {
                        if (ERR(rollbackErr, callback)) return;
                        return ERR(err, callback);
                    });
                } else {
                    callback(null, client, done);
                }
            });
        });
    },

    // rollback (if err) or commit the transaction, and release the client
    endTransaction: function(client, done, err, callback) {
        var that = this;
        if (err) {
            that.rollbackWithClient(client, done, function(rollbackErr) {
                if (rollbackErr) {
                    rollbackErr = error.addData(rollbackErr, {prevErr: err, rollback: "fail"});
                    return ERR(rollbackErr, callback);
                }
                err = error.addData(err, {rollback: "success"});
                ERR(err, callback);
            });
        } else {
            that.queryWithClient(client, 'COMMIT', [], function(err, result) {
                if (err) {
                    done();
                    return ERR(err, callback); // unconditionally return
                }
                done();
                callback(null);
            });
        }
    },

    query: function(sql, params, callback) {
        var that = this;
        that.pool.connect(function(err, client, done) {
            var handleError = function(err, extraData) {
                if (!err) return false;
                if (client) {
                    done(client);
                }
                err = error.addData(err, {sql: sql, params: params});
                ERR(err, callback);
                return true;
            };
            if (handleError(err)) return;
            that.paramsToArray(sql, params, function(err, newSql, newParams) {
                if (err) err = error.addData(err, {sql: sql, params: params});
                if (ERR(err, callback)) return;
                client.query(newSql, newParams, function(err, result) {
                    if (handleError(err)) return;
                    done();
                    callback(null, result);
                });
            });
        });
    },

    queryOneRow: function(sql, params, callback) {
        this.query(sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount !== 1) {
                var data = {sql: sql, params: params};
                return callback(error.makeWithData("Incorrect rowCount: " + result.rowCount, data));
            }
            callback(null, result);
        });
    },

    call: function(functionName, params, callback) {
        var placeholders = _.map(_.range(1, params.length + 1), v => '$' + v).join();
        var sql = 'SELECT ' + functionName + '(' + placeholders + ')';
        this.query(sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            callback(null, result);
        });
    },
};
