var fs = require('fs');
var _ = require('underscore');
var async = require('async');
var Promise = require('bluebird');
var csvStringify = require('csv').stringify;

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');
var db = require('../../db');

module.exports = {
    sync: function(courseInfo, testDB, questionDB, callback) {
        var that = module.exports;
        var filename = "/tmp/accesses.csv";
        that.readExistingMongoIDs(function(err, mongoIDs) {
            if (err) return callback(err);
            that.mongoToFile(filename, courseInfo, testDB, questionDB, mongoIDs, function(err) {
                if (err) return callback(err);
                that.fileToSQL(filename, function(err) {
                    if (err) return callback(err);
                    callback(null);
                });
            });
        });
    },
        
    readExistingMongoIDs: function(callback) {
        var sql = 'SELECT mongo_id FROM accesses;'
        Promise.try(function() {
            return models.sequelize.query(sql);
        }).spread(function(results, info) {
            var mongoIDs = {};
            _(results).each(function(result) {
                mongoIDs[result.mongo_id] = true;
            });
            callback(null, mongoIDs);
        }).catch(function(err) {
            callback(err);
        });
    },

    mongoToFile: function(filename, courseInfo, testDB, questionDB, mongoIDs, callback) {
        fs.open(filename, "w", function(err, fd) {
            if (err) return callback(err);
            db.accessCollect.find({}, function(err, cursor) {
                if (err) return callback(err);
                cursor.count(function(err, nObj) {
                    if (err) return callback(err);
                    var i = 0;
                    (function handle() {
                        cursor.next(function(err, obj) {
                            if (err) return callback(err);
                            if (obj == null) {
                                fs.close(fd, function(err) {
                                    if (err) return callback(err);
                                    return callback(null);
                                });
                                return;
                            }
                            i++;
                            if (mongoIDs[obj._id] != null) {
                                // already have this object in the SQL DB, skip to next iteration
                                if (i % 1000 == 0) {
                                    setTimeout(handle, 0);
                                } else {
                                    handle();
                                }
                            } else {
                                // don't have this object yet in SQL DB, write it to the CSV file
                                csvData = [[
                                    String(obj._id),
                                    obj.timestamp,
                                    obj.mode,
                                    obj.ip,
                                    obj.forwardedIP,
                                    obj.authUID,
                                    obj.authRole,
                                    obj.userUID,
                                    obj.userRole,
                                    obj.method,
                                    obj.path,
                                    obj.params,
                                    JSON.stringify(obj.body).replace(/\\u0000/g, '')
                                ]];
                                csvStringify(csvData, function(err, csv) {
                                    fs.write(fd, csv, function(err) {
                                        if (err) return callback(err);
                                        if (i % 1000 == 0) {
                                            setTimeout(handle, 0);
                                        } else {
                                            handle();
                                        }
                                    });
                                });
                            }
                        })
                    })();
                });
            });
        });
    },

    fileToSQL: function(filename, callback) {
        var sql
            = ' COPY accesses ('
            + '     mongo_id,'
            + '     date,'
            + '     mode,'
            + '     ip,'
            + '     forwarded_ip,'
            + '     auth_uid,'
            + '     auth_role,'
            + '     user_uid,'
            + '     user_role,'
            + '     method,'
            + '     path,'
            + '     params,'
            + '     body'
            + ' ) FROM :filename'
            + ' WITH (FORMAT csv)'
            + ' ;';
        var params = {
            filename: filename,
        };
        Promise.try(function() {
            return models.sequelize.query(sql, {replacements: params});
        }).spread(function(results, info) {
            //logger.infoOverride("copied to accesses: " + info.rowCount);
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
