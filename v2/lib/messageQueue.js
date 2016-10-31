var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var amqp = require('amqplib/callback_api');

var error = require('./error');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    mqChannel: null,
    amqpGradingQueue: null,
};

module.exports.init = function(config, callback) {
    if (!config.amqpAddress) return callback(null);
    amqp.connect(config.amqpAddress, function(err, conn) {
        if (ERR(err, callback)) return;;
        conn.createChannel(function(err, ch) {
            if (ERR(err, callback)) return;;
            ch.assertQueue(config.amqpGradingQueue, {durable: true}, function(err, ok) {
                if (ERR(err, callback)) return;;
                ch.assertQueue(config.amqpResultQueue, {durable: true}, function(err, ok) {
                    if (ERR(err, callback)) return;;

                    ch.prefetch(10); // process up to this many messages simultaneously
                    ch.consume(config.amqpResultQueue, module.exports.processGradingResult);

                    module.exports.mqChannel = ch;
                    module.exports.amqpGradingQueue = config.amqpGradingQueue;
                    callback(null);
                });
            });
        });
    });
};

module.exports.cancelGrading = function(grading_id, callback) {
    if (!this.mqChannel) return callback(new Error('Message queue not initialized'));
    // FIXME: implement this
    callback(null);
};

module.exports.sendToGradingQueue = function(grading_log, submission, variant, question, course, callback) {
    if (!this.mqChannel) return callback(new Error('Message queue not initialized'));
    var msgData = {
        gradingId: grading_log.id,
        submissionType: submission.type,
        course: {
            short_name: course.short_name,
            path: course.path,
        },
        question: {
            directory: question.directory,
            config: question.config,
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
    this.mqChannel.sendToQueue(this.amqpGradingQueue, new Buffer(JSON.stringify(msgData)), {persistent: true});
    // FIXME: how do we make this async?
    // apparently sendToQueue() returns a writable stream?
    // should we get the return value and do writer.on('finish', ...) ?
    callback(null);
};

module.exports.processGradingResult = function(msg) {
    var content, assessment_type;
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
            var grading_log_id = content.gradingId;
            var grading = {
                score: content.grading.score,
                correct: (content.grading.score >= 0.5),
                feedback: content.grading.feedback || null,
            };
            assessments.updateExternalGrading(assessment_type, grading_log_id, grading, function(err) {
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
