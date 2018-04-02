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
        var filename = "/tmp/accesses.csv";
        that.readExistingIds(function(err, existingIds) {
            if (err) return callback(err);
            that.mongoToFile(filename, courseInfo, existingIds, function(err) {
                if (err) return callback(err);
                that.fileToSQL(filename, callback);
            });
        });
    },
        
    readExistingIds: function(callback) {
        var sql = 'SELECT mongo_id FROM accesses;';
        sqldb.query(sql, [], function(err, result) {
            if (err) return callback(err);
            var existingIds = {};
            _(result.rows).forEach(function(row) {
                existingIds[row.mongo_id] = true;
            });
            callback(null, existingIds);
        });
    },

    mongoToFile: function(filename, courseInfo, existingIds, callback) {
        fs.open(filename, "w", function(err, fd) {
            if (err) return callback(err);
            db.accessCollect.find({}, function(err, cursor) {
                if (err) return callback(err);
                var done = false;
                async.doUntil(function(callback) {
                    cursor.next(function(err, obj) {
                        if (err) return callback(err);
                        if (obj == null) {
                            done = true;
                            return callback(null);
                        }
                        if (existingIds[obj._id]) {
                            // already have this object in the SQL DB, skip it
                            return callback(null);
                        }
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
                            JSON.stringify(obj.body).replace(/\\u0000/g, ''),
                        ]];
                        csvStringify(csvData, function(err, csv) {
                            if (err) return callback(err);
                            fs.write(fd, csv, callback);
                        });
                    });
                }, function() {return done;}, callback);
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
            + ' ) FROM \'' + filename + '\' WITH (FORMAT CSV);';
            + ' ;';
        sqldb.query(sql, [], callback);
    },
};
