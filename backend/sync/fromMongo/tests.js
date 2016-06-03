var fs = require('fs');
var _ = require('underscore');
var async = require('async');
var moment = require('moment-timezone');
var csvStringify = require('csv').stringify;

var sqldb = require('../../sqldb');
var config = require('../../config');
var db = require('../../db');

module.exports = {
    sync: function(courseInfo, callback) {
        var that = module.exports;
        var filename = "/tmp/tests.csv";
        that.readExistingIds(function(err, existingIds) {
            if (err) return callback(err);
            that.mongoToFile(filename, courseInfo, existingIds, function(err) {
                if (err) return callback(err);
                that.fileToSQL(filename, courseInfo, callback);
            });
        });
    },
        
    readExistingIds: function(callback) {
        var sql = 'SELECT tid FROM tests;'
        sqldb.query(sql, [], function(err, result) {
            if (err) return callback(err);
            var existingIds = {};
            _(result.rows).each(function(row) {
                existingIds[row.tid] = true;
            });
            callback(null, existingIds);
        });
    },

    mongoToFile: function(filename, courseInfo, existingIds, callback) {
        fs.open(filename, "w", function(err, fd) {
            if (err) return callback(err);
            db.tCollect.find({}, function(err, cursor) {
                if (err) return callback(err);
                var done = false;
                async.doUntil(function(callback) {
                    cursor.next(function(err, obj) {
                        if (err) return callback(err);
                        if (obj == null) {
                            done = true;
                            return callback(null);
                        }
                        if (!existingIds[obj.tid]) {
                            // only update data for tests in the SQL DB
                            return callback(null);
                        }
                        csvData = [[
                            obj.tid,
                            JSON.stringify(obj),
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

    fileToSQL: function(filename, courseInfo, callback) {
        // load import data into a temporary table
        var sql
            = ' DROP TABLE IF EXISTS tests_import;'
            + ' CREATE TABLE tests_import ('
            + '     tid VARCHAR(255),'
            + '     obj JSONB'
            + ' );'
            + ' COPY tests_import (tid, obj)'
            + ' FROM \'' + filename + '\' WITH (FORMAT CSV);';
        sqldb.query(sql, [], function(err) {
            if (err) return callback(err);
            // update 
            var sql
                = ' UPDATE tests AS t'
                + ' SET obj = ti.obj'
                + ' FROM tests_import AS ti'
                + ' WHERE t.tid = ti.tid';
            sqldb.query(sql, [], callback);
        });
    },
};
