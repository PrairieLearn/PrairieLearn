var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var amqp = require('amqplib/callback_api');

var error = require('./error');
var logger = require('./logger');
var sqldb = require('./sqldb');
var sqlLoader = require('./sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    mqChannel: null,
};

module.exports.init = function(config, processGradingResult, callback) {
    if (!config.amqpAddress) return callback(null);
    amqp.connect(config.amqpAddress, function(err, conn) {
        if (ERR(err, callback)) return;;
        conn.createChannel(function(err, ch) {
            if (ERR(err, callback)) return;
            ch.assertQueue(config.amqpResultQueue, {durable: true}, function(err, ok) {
                if (ERR(err, callback)) return;;

                ch.prefetch(5); // process up to this many messages simultaneously
                ch.consume(config.amqpResultQueue, processGradingResult);

                module.exports.mqChannel = ch;
                callback(null);
            });
        });
    });
};

module.exports.sendToGradingQueue = function(grading_log, submission, variant, question, course, callback) {
    if (!this.mqChannel) return callback(new Error('Message queue not initialized'));
    var msgData = {
        gradingId: grading_log.id,
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
            type: submission.type,
        },
    };
    var amqpGradingQueue = 'grade-' + course.grading_queue;
    module.exports.mqChannel.assertQueue(amqpGradingQueue, {durable: true}, function(err, ok) {
        if (ERR(err, callback)) return;;
        module.exports.mqChannel.sendToQueue(amqpGradingQueue, new Buffer(JSON.stringify(msgData)), {persistent: true});
        // FIXME: how do we make this async?
        // apparently sendToQueue() returns a writable stream?
        // should we get the return value and do writer.on('finish', ...) ?
        callback(null);
    });
};

module.exports.cancelGrading = function(grading_id, callback) {
    if (!this.mqChannel) return callback(new Error('Message queue not initialized'));
    // FIXME: implement this
    callback(null);
};
