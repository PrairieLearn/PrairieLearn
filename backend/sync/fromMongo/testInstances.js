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
        var filename = "/tmp/test_instances.csv";
        that.readExistingIds(function(err, existingIds) {
            if (err) return callback(err);
            that.mongoToFile(filename, courseInfo, existingIds, function(err) {
                if (err) return callback(err);
                that.fileToSQL(filename, courseInfo, callback);
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
                        }
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
                    });
                }, function() {return done;}, callback);
            });
        });
    },

    fileToSQL: function(filename, courseInfo, callback) {
        // load import data into a temporary table
        var sql
            = ' DROP TABLE IF EXISTS test_instances_import;'
            + ' CREATE TABLE test_instances_import ('
            + '     date TIMESTAMP WITH TIME ZONE,'
            + '     uid VARCHAR(255),'
            + '     tid VARCHAR(255),'
            + '     tiid VARCHAR(255),'
            + '     number INTEGER,'
            + '     score DOUBLE PRECISION,'
            + '     score_perc INTEGER,'
            + '     finish_date TIMESTAMP WITH TIME ZONE,'
            + '     grading_dates JSONB'
            + ' );'
            + ' COPY test_instances_import (date, uid, tid, tiid, number, score, score_perc, finish_date, grading_dates)'
            + ' FROM \'' + filename + '\' WITH (FORMAT CSV);';
        sqldb.query(sql, [], function(err) {
            if (err) return callback(err);
            // create new test_instances from imported data
            var sql
                = ' INSERT INTO test_instances (tiid, date, number, test_id, user_id, auth_user_id)'
                + ' ('
                + '     SELECT tii.tiid, tii.date, tii.number, t.id, u.id, u.id'
                + '     FROM test_instances_import AS tii'
                + '     LEFT JOIN users AS u ON (u.uid = tii.uid)'
                + '     LEFT JOIN ('
                + '         SELECT t.id,t.tid,ci.course_id'
                + '         FROM tests AS t'
                + '         JOIN course_instances AS ci ON (ci.id = t.course_instance_id)'
                + '     ) AS t ON (t.tid = tii.tid AND t.course_id = $1)'
                + ' )'
                + ' ON CONFLICT DO NOTHING;';
            sqldb.query(sql, [courseInfo.courseId], function(err) {
                if (err) return callback(err);
                // create new test_states from imported data
                // first make an "open" test_state for every test instance
                // also make "closed" test states for tests with a finish_date
                var sql
                    = ' INSERT INTO test_states (date, open, test_instance_id, auth_user_id)'
                    + ' ('
                    + '     SELECT tii.date, TRUE, ti.id, u.id'
                    + '     FROM test_instances_import AS tii'
                    + '     JOIN users AS u ON (u.uid = tii.uid)'
                    + '     JOIN test_instances AS ti ON (ti.tiid = tii.tiid)'
                    + ' )'
                    + ' ON CONFLICT DO NOTHING;'
                    + ' INSERT INTO test_states (date, open, test_instance_id, auth_user_id)'
                    + ' ('
                    + '     SELECT tii.finish_date, FALSE, ti.id, u.id'
                    + '     FROM test_instances_import AS tii'
                    + '     JOIN users AS u ON (u.uid = tii.uid)'
                    + '     JOIN test_instances AS ti ON (ti.tiid = tii.tiid)'
                    + '     WHERE tii.finish_date IS NOT NULL'
                    + ' )'
                    + ' ON CONFLICT DO NOTHING;';
                sqldb.query(sql, [], function(err) {
                    if (err) return callback(err);
                    // create test_scores for imported data
                    // this is somewhat lossy, because we can't perfectly reconstruct all information
                    // and so we aren't trying too hard
                    var sql
                        = ' INSERT INTO test_scores (date, points, max_points, score_perc, test_instance_id, auth_user_id)'
                        + ' ('
                        + '     SELECT tii.finish_date, tii.score, NULL, tii.score_perc, ti.id, u.id'
                        + '     FROM test_instances_import AS tii'
                        + '     JOIN users AS u ON (u.uid = tii.uid)'
                        + '     JOIN test_instances AS ti ON (ti.tiid = tii.tiid)'
                        + '     JOIN tests AS t ON (t.id = ti.test_id)'
                        + ' )'
                        + ' ON CONFLICT DO NOTHING;';
                    sqldb.query(sql, [], callback);
                });
            });
        });
    },
};
