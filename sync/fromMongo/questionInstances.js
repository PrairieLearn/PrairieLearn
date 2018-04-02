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
        var filename = "/tmp/question_instances.csv";
        that.readExistingIds(function(err, existingIds) {
            if (err) return callback(err);
            that.mongoToFile(filename, courseInfo, existingIds, function(err) {
                if (err) return callback(err);
                that.fileToSQL(filename, callback);
            });
        });
    },
        
    readExistingIds: function(callback) {
        var sql = 'SELECT qiid FROM question_instances;'
        sqldb.query(sql, [], function(err, result) {
            if (err) return callback(err);
            var existingIds = {};
            _(result.rows).forEach(function(row) {
                existingIds[row.qiid] = true;
            });
            callback(null, existingIds);
        });
    },

    mongoToFile: function(filename, courseInfo, existingIds, callback) {
        fs.open(filename, "w", function(err, fd) {
            if (err) return callback(err);
            db.qiCollect.find({}, function(err, cursor) {
                if (err) return callback(err);
                var done = false;
                async.doUntil(function(callback) {
                    cursor.next(function(err, obj) {
                        if (err) return callback(err);
                        if (obj == null) {
                            done = true;
                            return callback(null);
                        }
                        if (existingIds[obj.qiid]) {
                            // already have this object in the SQL DB, skip it
                            return callback(null);
                        }
                        csvData = [[
                            moment(obj.date).tz(config.timezone).format(),
                            obj.qid,
                            obj.qiid,
                            obj.uid,
                            obj.tid,
                            obj.tiid,
                            obj.vid,
                            JSON.stringify(obj.params),
                            JSON.stringify(obj.trueAnswer),
                            JSON.stringify(obj.options),
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
        // load import data into a temporary table
        var sql
            = ' DROP TABLE IF EXISTS question_instances_import;'
            + ' CREATE TABLE question_instances_import ('
            + '     date TIMESTAMP WITH TIME ZONE,'
            + '     qid VARCHAR(255),'
            + '     qiid VARCHAR(255),'
            + '     uid VARCHAR(255),'
            + '     tid VARCHAR(255),'
            + '     tiid VARCHAR(255),'
            + '     vid VARCHAR(255),'
            + '     params JSONB,'
            + '     true_answer JSONB,'
            + '     options JSONB'
            + ' );'
            + ' COPY question_instances_import (date, qid, qiid, uid, tid, tiid, vid, params, true_answer, options)'
            + ' FROM \'' + filename + '\' WITH (FORMAT CSV);';
        sqldb.query(sql, [], function(err) {
            if (err) return callback(err);
            // create new question_instances from imported data
            var sql
                = ' INSERT INTO question_instances (qiid, date, variant_seed, params, true_answer, options,'
                + '                                 assessment_instance_id, assessment_question_id, auth_user_id, number)'
                + ' ('
                + '     SELECT qii.qiid, qii.date, qii.vid, qii.params, qii.true_answer, qii.options, ai.id, aq.id, u.id,'
                + '         CASE'
                + '             WHEN ai.qids @> \'[]\'::JSONB'
                + '                 THEN array_position(ARRAY(SELECT jsonb_array_elements_text(ai.qids)), qii.qid::text)'
                + '             ELSE aq.number'
                + '         END'
                + '     FROM question_instances_import AS qii'
                + '     JOIN users AS u ON (u.uid = qii.uid)'
                + '     JOIN assessment_instances AS ai ON (ai.tiid = qii.tiid)'
                + '     JOIN ('
                + '         SELECT aq.*,q.qid'
                + '         FROM assessment_questions AS aq'
                + '         JOIN questions AS q ON (q.id = aq.question_id)'
                + '     ) AS aq ON (aq.qid = qii.qid AND aq.assessment_id = ai.assessment_id)'
                + ' )'
                + ' ON CONFLICT DO NOTHING;';
            sqldb.query(sql, [], callback);
        });
    },
};
