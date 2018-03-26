var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var logger = require('../../lib/logger');
var sqldb = require('@prairielearn/prairielib/sql-db');
var config = require('../../lib/config');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, questionDB, jobLogger, callback) {
        var questionIds = [];
        logger.debug('Syncing questions');
        async.series([
            function(callback) {
                var err = null;
                _(questionDB)
                    .groupBy('uuid')
                    .each(function(questions, uuid) {
                        if (questions.length > 1) {
                            err = new Error('UUID ' + uuid + ' is used in multiple questions: '
                                            + _.map(questions, 'directory').join());
                            return false; // terminate each()
                        }
                    });
                if (err) return callback(err);
                callback(null);
            },
            function(callback) {
                async.forEachOfSeries(questionDB, function(q, qid, callback) {
                    logger.debug('Checking uuid for ' + qid);
                    sqldb.call('questions_with_uuid_elsewhere', [courseInfo.courseId, q.uuid], function(err, result) {
                        if (ERR(err, callback)) return;
                        if (result.rowCount > 0) return callback(new Error('UUID ' + q.uuid + ' from question ' + qid + ' already in use in different course'));
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                async.forEachOfSeries(questionDB, function(q, qid, callback) {
                    logger.debug('Syncing question ' + qid);
                    let external_grading_files = null;
                    if (q.externalGradingOptions) {
                        const opts = q.externalGradingOptions;
                        if (opts.files && opts.serverFilesCourse) {
                            return callback(new Error(`Question ${qid} cannot use both externalGradingOptions.files and externalGradingOptions.serverFilesCourse`));
                        } else if (opts.files) {
                            jobLogger.warn(`WARNING: Question ${qid} uses externalGradingOptions.files, which will be deprecated in favor of externalGradingOptions.serverFilesCourse`);
                            external_grading_files = opts.files;
                        } else if (opts.serverFilesCourse) {
                            external_grading_files = opts.serverFilesCourse;
                        }
                    }
                    let partialCredit;
                    if (q.partialCredit != null) {
                        partialCredit = q.partialCredit;
                    } else {
                        if (q.type == 'v3') {
                            partialCredit = true;
                        } else {
                            partialCredit = false;
                        }
                    }
                    var params = {
                        uuid: q.uuid,
                        qid: qid,
                        type: (q.type == 'v3') ? 'Freeform' : q.type,
                        title: q.title,
                        partial_credit: partialCredit,
                        template_directory: q.template,
                        options: q.options,
                        client_files: q.clientFiles || [],
                        course_id: courseInfo.courseId,
                        topic: q.topic,
                        grading_method: q.gradingMethod || 'Internal',
                        single_variant: !!q.singleVariant,
                        external_grading_enabled: (q.externalGradingOptions && q.externalGradingOptions.enabled),
                        external_grading_image: (q.externalGradingOptions && q.externalGradingOptions.image),
                        external_grading_files: external_grading_files,
                        external_grading_entrypoint: (q.externalGradingOptions && q.externalGradingOptions.entrypoint),
                        external_grading_timeout: (q.externalGradingOptions && q.externalGradingOptions.timeout),
                        external_grading_enable_networking: (q.externalGradingOptions && q.externalGradingOptions.enableNetworking),
                    };
                    sqldb.queryOneRow(sql.insert_question, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        q.id = result.rows[0].id;
                        questionIds.push(result.rows[0].id);
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                // soft-delete questions from the DB that aren't on disk
                logger.debug('Soft-deleting unused questions');
                var params = {
                    course_id: courseInfo.courseId,
                    keep_question_ids: questionIds,
                };
                sqldb.query(sql.soft_delete_unused_questions, params, function(err, _result) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                var params = {course_id: courseInfo.courseId};
                sqldb.query(sql.ensure_numbers, params, function(err, _result) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
};
