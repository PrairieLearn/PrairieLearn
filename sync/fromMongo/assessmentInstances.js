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
        var filename = "/tmp/assessment_instances.csv";
        that.readExistingIds(function(err, existingIds) {
            if (err) return callback(err);
            that.mongoToFile(filename, courseInfo, existingIds, function(err) {
                if (err) return callback(err);
                that.fileToSQL(filename, courseInfo, callback);
            });
        });
    },
        
    readExistingIds: function(callback) {
        var sql = 'SELECT tiid FROM assessment_instances;'
        sqldb.query(sql, [], function(err, result) {
            if (err) return callback(err);
            var existingIds = {};
            _(result.rows).forEach(function(row) {
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
                            JSON.stringify(obj.qids),
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
            = ' DROP TABLE IF EXISTS assessment_instances_import;'
            + ' CREATE TABLE assessment_instances_import ('
            + '     date TIMESTAMP WITH TIME ZONE,'
            + '     uid VARCHAR(255),'
            + '     tid VARCHAR(255),'
            + '     tiid VARCHAR(255),'
            + '     number INTEGER,'
            + '     score DOUBLE PRECISION,'
            + '     score_perc INTEGER,'
            + '     finish_date TIMESTAMP WITH TIME ZONE,'
            + '     grading_dates JSONB,'
            + '     qids JSONB,'
            + '     obj JSONB'
            + ' );'
            + ' COPY assessment_instances_import (date, uid, tid, tiid, number, score, score_perc, finish_date, grading_dates, qids, obj)'
            + ' FROM \'' + filename + '\' WITH (FORMAT CSV);';
        sqldb.query(sql, [], function(err) {
            if (err) return callback(err);
            // create new assessment_instances from imported data
            var sql
                = ' INSERT INTO assessment_instances (tiid, qids, obj, date, number, assessment_id, user_id, auth_user_id)'
                + ' ('
                + '     SELECT tii.tiid, tii.qids, tii.obj, tii.date, tii.number, a.id, u.id, u.id'
                + '     FROM assessment_instances_import AS tii'
                + '     JOIN users AS u ON (u.uid = tii.uid)'
                + '     JOIN ('
                + '         SELECT a.id,a.tid,ci.course_id'
                + '         FROM assessments AS a'
                + '         JOIN course_instances AS ci ON (ci.id = a.course_instance_id)'
                + '     ) AS a ON (a.tid = tii.tid AND a.course_id = $1)'
                + ' )'
                + ' ON CONFLICT DO NOTHING;';
            sqldb.query(sql, [courseInfo.courseId], function(err) {
                if (err) return callback(err);
                // create new assessment_states from imported data
                // first make an "open" assessment_state for every assessment instance
                // also make "closed" assessment states for assessments with a finish_date
                var sql
                    = ' INSERT INTO assessment_states (date, open, assessment_instance_id, auth_user_id)'
                    + ' ('
                    + '     SELECT tii.date, TRUE, ai.id, u.id'
                    + '     FROM assessment_instances_import AS tii'
                    + '     JOIN users AS u ON (u.uid = tii.uid)'
                    + '     JOIN assessment_instances AS ai ON (ai.tiid = tii.tiid)'
                    + ' )'
                    + ' ON CONFLICT DO NOTHING;'
                    + ' INSERT INTO assessment_states (date, open, assessment_instance_id, auth_user_id)'
                    + ' ('
                    + '     SELECT tii.finish_date, FALSE, ai.id, u.id'
                    + '     FROM assessment_instances_import AS tii'
                    + '     JOIN users AS u ON (u.uid = tii.uid)'
                    + '     JOIN assessment_instances AS ai ON (ai.tiid = tii.tiid)'
                    + '     WHERE tii.finish_date IS NOT NULL'
                    + ' )'
                    + ' ON CONFLICT DO NOTHING;';
                sqldb.query(sql, [], function(err) {
                    if (err) return callback(err);
                    // create assessment_scores for imported data
                    // this is somewhat lossy, because we can't perfectly reconstruct all information
                    // and so we aren't trying too hard
                    var sql
                        = ' INSERT INTO assessment_scores (date, points, max_points, score_perc, assessment_instance_id, auth_user_id)'
                        + ' ('
                        + '     SELECT tii.finish_date, tii.score, NULL, tii.score_perc, ai.id, u.id'
                        + '     FROM assessment_instances_import AS tii'
                        + '     JOIN users AS u ON (u.uid = tii.uid)'
                        + '     JOIN assessment_instances AS ai ON (ai.tiid = tii.tiid)'
                        + '     JOIN assessments AS a ON (a.id = ai.assessment_id)'
                        + ' )'
                        + ' ON CONFLICT DO NOTHING;';
                    sqldb.query(sql, [], function(err) {
                        if (err) return callback(err);
                        // ensure we have enrollments corresponding to newly imported assessment instances
                        var sql
                            = ' INSERT INTO enrollments (user_id, course_instance_id, role)'
                            + ' ('
                            + '     SELECT u.id, a.course_instance_id,\'Student\''
                            + '     FROM assessment_instances_import AS tii'
                            + '     JOIN users AS u ON (u.uid = tii.uid)'
                            + '     JOIN assessment_instances AS ai ON (ai.tiid = tii.tiid)'
                            + '     JOIN assessments AS a ON (a.id = ai.assessment_id)'
                            + ' )'
                            + ' ON CONFLICT DO NOTHING;';
                        sqldb.query(sql, [], callback);
                    });
                });
            });
        });
    },
};
