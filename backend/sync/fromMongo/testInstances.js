var fs = require('fs');
var _ = require('underscore');
var async = require('async');
var moment = require('moment-timezone');
var csvStringify = require('csv').stringify;

var sqldb = require('../../sqldb');
var config = require('../../config');
var db = require('../../db');

var testInstancesSql = fs.readFileSync('./sync/fromMongo/testInstances.sql', 'utf8');

module.exports = {
    sync: function(courseInfo, callback) {
        var that = module.exports;
        var filename = "/tmp/test_instances.csv";
        that.readExistingIds(function(err, existingIds) {
            if (err) return callback(err);
            that.mongoToFile(filename, courseInfo, existingIds, function(err) {
                if (err) return callback(err);
                sqldb.query(testInstancesSql, [], callback);
            });
        });
    },
        
    readExistingIds: function(callback) {
        var sql = 'SELECT tiid FROM test_instances;'
        sqldb.query(sql, [], function(err, result) {
            if (err) return callback(err);
            var existingIds = {};
            _(result.rows).each(function(row) {
                existingIds[row.tiid] = true;
            });
            callback(null, existingIds);
        });
    },

    mongoToFile: function(filename, courseInfo, existingIds, callback) {
        fs.open(filename, "w", function(err, fd) {
            if (err) return callback(err);
            db.tiCollect.find({}, function(err, cursor) {
                if (err) return callback(err);
                var done = false;
                async.doUntil(function(callback) {
                    cursor.next(function(err, obj) {
                        if (err) return callback(err);
                        if (obj == null) {
                            done = true;
                            return callback(null);
                        } else {
                            if (existingIds[obj.tiid]) {
                                // already have this object in the SQL DB, skip it
                                return callback(null);
                            }
                            csvData = [[
                                moment(obj.date).tz(config.timezone).format(),
                                obj.uid,
                                obj.tid,
                                obj.tiid,
                                obj.number,
                                obj.score,
                                obj.scorePerc,
                                obj.finishDate,
                                JSON.stringify(obj.gradingDates),
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
};
