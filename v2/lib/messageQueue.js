var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var amqp = require('amqplib/callback_api');

var config = require('./config');
var error = require('./error');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    mqChannel: null,
};

module.exports.init = function(callback, config) {
    if (!config.amqpAddress) return callback(null);
    amqp.connect(config.amqpAddress, function(err, conn) {
        if (ERR(err, callback)) return;;
        conn.createChannel(function(err, ch) {
            if (ERR(err, callback)) return;;
            ch.assertQueue(config.amqpGradingQueue, {durable: true}, function(err, ok) {
                if (ERR(err, callback)) return;;
                ch.assertQueue(config.amqpResultQueue, {durable: true}, function(err, ok) {
                    if (ERR(err, callback)) return;;

                    ch.prefetch(5); // process up to five messages simultaneously
                    ch.consume(config.amqpResultQueue, module.exports.processGradingResult);

                    module.exports.mqChannel = ch;
                    callback(null);
                });
            });
        });
    });
};

module.exports.sendToGradingQueue = function(submission_id, auth_user_id, grading_type, callback) {
    var params = {
        submission_id: submission_id,
        grading_type: grading_type,
        auth_user_id: auth_user_id,
    };
    sqldb.queryOneRow(sql.insert_grading_log, params, function(err, result) {
        if (ERR(err, callback)) return;
        var grading_log = result.rows[0].grading_log;
        var question = result.rows[0].question;
        var variant = result.rows[0].variant;
        var submission = result.rows[0].submission;

        var msgData = {
            gradingId: grading_log.id,
            gradingType: grading_type,
            course: {
                short_name: course.short_name,
                path: course.path,
            },
            question: {
                directory: directory,
                config: config,
            },
            variant: {
                variantSeed: variant.variant_seed,
                params: variant.params,
                trueAnswer: variant.true_answer,
                options: variant.options,
            },
            submission: {
                submittedAnswer: submission.submitted_answer,
            },
        };
        mqChannel.sendToQueue(config.amqpGradingQueue, new Buffer(JSON.stringify(msgData)), {persistent: true});
        callback(null);
    });
};

module.exports.processGradingResult = function(msg) {
    var content, assessment_type, assessment_instance_id, grading_log;
    async.series([
        function(callback) {
            try {
                var content = JSON.parse(msg.content.toString());
            } catch (err) {
                ERR(err);
                return callback(err);
            }
            callback(null);
        },
        function(callback) {
            if (!_(content.gradingId).isInteger()) return callback(new Error('invalid gradingId'));
            var params = {
                grading_log_id: content.gradingId,
            };
            sqldb.queryOneRow(sql.select_assessment_info, params, function(err, result) {
                if (ERR(err, callback)) return;

                assessment_type = result.rows[0].assessment_type;
                assessment_instance_id = result.rows[0].assessment_instance_id;
                callback(null);
            });
        },
        function(callback) {
            if (!_(content.grading).isObject()) return callback(new Error('invalid grading'));
            if (!_(content.grading.score).isNumber()) return callback(new Error('invalid grading.score'));
            if (content.grading.score < 0 || content.grading.score > 1) return callback(new Error('grading.score out of range'));
            if (_(content.grading).has('feedback') && !_(content.grading.feedback).isObject())
                return callback(new Error('invalid content.grading'));
            grading_log = {
                id: content.gradingId,
                score: content.grading.score,
                correct: (content.grading.score >= 0.5),
                feedback: content.grading.feedback || null,
            };
            assessments.updateGradingLog(assessment_type, grading_log, function(err, gl) {
                if (ERR(err, callback)) return;
                grading_log = gl;
                callback(null);
            });
        },
        function(callback) {
            assessments.scoreAssessmentInstance(assessment_type, assessment_instance_id, grading_log.auth_user_id, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err)) {
            logger.error('processGradingResult: error', {err: err, msg: msg});
        }
        return mqChannel.ack(msg);
    });
};
