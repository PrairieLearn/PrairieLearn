var ERR = require('async-stacktrace');
var _ = require('lodash');
var pg = require('pg');
var path = require('path');
var debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

var error = require('./error');

const debugString = function(s) {
    if (!_.isString(s)) return 'NOT A STRING';
    s = s.replace(/\n/g, '\\n');
    if (s.length > 78) s = s.substring(0, 75) + '...';
    s = '"' + s + '"';
    return s;
};

const debugParams = function(params) {
    let s;
    try {
        s = JSON.stringify(params);
    } catch (err) {
        s = 'CANNOT JSON STRINGIFY';
    }
    return debugString(s);
};

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
        if (!_.isObjectLike(params)) return callback(new Error('params must be array or object'));
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
                if (!_(params).has(v)) return callback(new Error('Missing parameter: ' + v));
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
        debug('queryWithClient()', 'sql:', debugString(sql));
        debug('queryWithClient()', 'params:', debugParams(params));
        this.paramsToArray(sql, params, function(err, newSql, newParams) {
            if (err) err = error.addData(err, {sql: sql, sqlParams: params});
            if (ERR(err, callback)) return;
            client.query(newSql, newParams, function(err, result) {
                if (err) {
                    const sqlError = JSON.parse(JSON.stringify(err));
                    sqlError.message = err.message;
                    err = error.addData(err, {sqlError: sqlError, sql: sql, sqlParams: params, result: result});
                }
                if (ERR(err, callback)) return;
                debug('queryWithClient() success', 'rowCount:', result.rowCount);
                callback(null, result);
            });
        });
    },

    queryWithClientOneRow: function(client, sql, params, callback) {
        debug('queryWithClientOneRow()', 'sql:', debugString(sql));
        debug('queryWithClientOneRow()', 'params:', debugParams(params));
        this.queryWithClient(client, sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount !== 1) {
                var data = {sql: sql, sqlParams: params, result: result};
                return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
            }
            debug('queryWithClientOneRow() success', 'rowCount:', result.rowCount);
            callback(null, result);
        });
    },

    queryWithClientZeroOrOneRow: function(client, sql, params, callback) {
        debug('queryWithClientZeroOrOneRow()', 'sql:', debugString(sql));
        debug('queryWithClientZeroOrOneRow()', 'params:', debugParams(params));
        this.queryWithClient(client, sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount > 1) {
                var data = {sql: sql, sqlParams: params, result: result};
                return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
            }
            debug('queryWithClientZeroOrOneRow() success', 'rowCount:', result.rowCount);
            callback(null, result);
        });
    },

    releaseClient: function(client, done) {
        debug('releaseClient()');
        done();
    },

    rollbackWithClient: function(client, done, callback) {
        debug('rollbackWithClient()');
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
        debug('beginTransaction()');
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
        debug('endTransaction()');
        var that = this;
        if (err) {
            that.rollbackWithClient(client, done, function(rollbackErr) {
                if (rollbackErr) {
                    rollbackErr = error.addData(rollbackErr, {prevErr: err, rollback: 'fail'});
                    return ERR(rollbackErr, callback);
                }
                err = error.addData(err, {rollback: 'success'});
                ERR(err, callback);
            });
        } else {
            that.queryWithClient(client, 'COMMIT', [], function(err, _result) {
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
        debug('query()', 'sql:', debugString(sql));
        debug('query()', 'params:', debugParams(params));
        var that = this;
        that.pool.connect(function(err, client, done) {
            var handleError = function(err) {
                if (!err) return false;
                if (client) {
                    done(client);
                }
                const sqlError = JSON.parse(JSON.stringify(err));
                sqlError.message = err.message;
                err = error.addData(err, {sqlError: sqlError, sql: sql, sqlParams: params});
                ERR(err, callback);
                return true;
            };
            if (handleError(err)) return;
            that.paramsToArray(sql, params, function(err, newSql, newParams) {
                if (err) err = error.addData(err, {sql: sql, sqlParams: params});
                if (ERR(err, callback)) return;
                client.query(newSql, newParams, function(err, result) {
                    if (handleError(err)) return;
                    done();
                    debug('query() success', 'rowCount:', result.rowCount);
                    callback(null, result);
                });
            });
        });
    },

    queryOneRow: function(sql, params, callback) {
        debug('queryOneRow()', 'sql:', debugString(sql));
        debug('queryOneRow()', 'params:', debugParams(params));
        this.query(sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount !== 1) {
                var data = {sql: sql, sqlParams: params};
                return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
            }
            debug('queryOneRow() success', 'rowCount:', result.rowCount);
            callback(null, result);
        });
    },

    queryZeroOrOneRow: function(sql, params, callback) {
        debug('queryZeroOrOneRow()', 'sql:', debugString(sql));
        debug('queryZeroOrOneRow()', 'params:', debugParams(params));
        this.query(sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount > 1) {
                var data = {sql: sql, sqlParams: params};
                return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
            }
            debug('queryZeroOrOneRow() success', 'rowCount:', result.rowCount);
            callback(null, result);
        });
    },

    call: function(functionName, params, callback) {
        debug('call()', 'function:', functionName);
        debug('call()', 'params:', debugParams(params));
        var placeholders = _.map(_.range(1, params.length + 1), v => '$' + v).join();
        var sql = 'SELECT * FROM ' + functionName + '(' + placeholders + ')';
        this.query(sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            debug('call() success', 'rowCount:', result.rowCount);
            callback(null, result);
        });
    },

    callOneRow: function(functionName, params, callback) {
        debug('callOneRow()', 'function:', functionName);
        debug('callOneRow()', 'params:', debugParams(params));
        this.call(functionName, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount !== 1) {
                var data = {functionName: functionName, sqlParams: params};
                return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
            }
            debug('callOneRow() success', 'rowCount:', result.rowCount);
            callback(null, result);
        });
    },

    callZeroOrOneRow: function(functionName, params, callback) {
        debug('callZeroOrOneRow()', 'function:', functionName);
        debug('callZeroOrOneRow()', 'params:', debugParams(params));
        this.call(functionName, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount > 1) {
                var data = {functionName: functionName, sqlParams: params};
                return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
            }
            debug('callZeroOrOneRow() success', 'rowCount:', result.rowCount);
            callback(null, result);
        });
    },

    callWithClient: function(client, functionName, params, callback) {
        debug('callWithClient()', 'function:', functionName);
        debug('callWithClient()', 'params:', debugParams(params));
        var placeholders = _.map(_.range(1, params.length + 1), v => '$' + v).join();
        var sql = 'SELECT * FROM ' + functionName + '(' + placeholders + ')';
        this.queryWithClient(client, sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            debug('callWithClient() success', 'rowCount:', result.rowCount);
            callback(null, result);
        });
    },

    callWithClientOneRow: function(client, functionName, params, callback) {
        debug('callWithClientOneRow()', 'function:', functionName);
        debug('callWithClientOneRow()', 'params:', debugParams(params));
        var placeholders = _.map(_.range(1, params.length + 1), v => '$' + v).join();
        var sql = 'SELECT * FROM ' + functionName + '(' + placeholders + ')';
        this.queryWithClient(client, sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount !== 1) {
                var data = {functionName: functionName, sqlParams: params};
                return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
            }
            debug('callWithClientOneRow() success', 'rowCount:', result.rowCount);
            callback(null, result);
        });
    },

    callWithClientZeroOrOneRow: function(client, functionName, params, callback) {
        debug('callWithClientZeroOrOneRow()', 'function:', functionName);
        debug('callWithClientZeroOrOneRow()', 'params:', debugParams(params));
        var placeholders = _.map(_.range(1, params.length + 1), v => '$' + v).join();
        var sql = 'SELECT * FROM ' + functionName + '(' + placeholders + ')';
        this.queryWithClient(client, sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount > 1) {
                var data = {functionName: functionName, sqlParams: params};
                return callback(error.makeWithData('Incorrect rowCount: ' + result.rowCount, data));
            }
            debug('callWithClientZeroOrOneRow() success', 'rowCount:', result.rowCount);
            callback(null, result);
        });
    },
};
