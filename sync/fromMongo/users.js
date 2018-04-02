var fs = require('fs');
var _ = require('lodash');
var async = require('async');
var moment = require('moment-timezone');
var csvStringify = require('csv').stringify;

var sqldb = require('@prairielearn/prairielib/sql-db');
var config = require('../../lib/config');
var db = require('../../lib/db');

module.exports = {
    sync: function(courseInfo, callback) {
        var that = module.exports;
        var filename = "/tmp/users.csv";
        that.readExistingIds(function(err, existingIds) {
            if (err) return callback(err);
            that.mongoToFile(filename, courseInfo, existingIds, function(err) {
                if (err) return callback(err);
                that.fileToSQL(filename, callback);
            });
        });
    },
        
    readExistingIds: function(callback) {
        var sql = 'SELECT uid, name FROM users;'
        sqldb.query(sql, [], function(err, result) {
            if (err) return callback(err);
            var existingIds = {};
            _(result.rows).forEach(function(row) {
                existingIds[row.uid] = row.name;
            });
            callback(null, existingIds);
        });
    },

    mongoToFile: function(filename, courseInfo, existingIds, callback) {
        fs.open(filename, "w", function(err, fd) {
            if (err) return callback(err);
            db.uCollect.find({}, function(err, cursor) {
                if (err) return callback(err);
                var done = false;
                async.doUntil(function(callback) {
                    cursor.next(function(err, obj) {
                        if (err) return callback(err);
                        if (obj == null) {
                            done = true;
                            return callback(null);
                        }
                        if (existingIds[obj.uid] !== undefined) {
                            // already have this object in the SQL DB, skip to next iteration
                            var name = existingIds[obj.uid];
                            if (name === null) {
                                // don't have a name in the DB, write it
                                var sql = 'UPDATE users SET name = $1 WHERE uid = $2;';
                                var params = [obj.name, obj.uid];
                                sqldb.query(sql, params, callback);
                            } else {
                                callback(null);
                            }
                        } else {
                            // don't have this object yet in SQL DB, write it to the CSV file
                            csvData = [[
                                obj.uid,
                                obj.name,
                            ]];
                            csvStringify(csvData, function(err, csv) {
                                if (err) return callback(err);
                                fs.write(fd, csv, callback);
                            });
                        }
                    });
                }, function() {return done;}, callback);
            });
        });
    },

    fileToSQL: function(filename, callback) {
        var sql
            = ' COPY users ('
            + '     uid,'
            + '     name'
            + ' ) FROM \'' + filename + '\''
            + ' WITH (FORMAT csv)'
            + ' ;';
        sqldb.query(sql, [], callback);
    },
};
