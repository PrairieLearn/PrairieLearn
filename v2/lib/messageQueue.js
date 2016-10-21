var amqp = require('amqplib/callback_api');

module.exports = {};

module.exports.init = function() {
};


var sendToGradingQueue = function(gradingData) {
    mqChannel.sendToQueue(config.amqpGradingQueue, new Buffer(JSON.stringify(gradingData)), {persistent: true});
};

var processGradingResult = function(msg) {
    try {
        var serverResult = JSON.parse(msg.content.toString());
    } catch (e) {
        logger.error('processGradingResult: error decoding msg', msg, e);
        return mqChannel.ack(msg);
    }
    var gid = serverResult.gid;
    if (!_(gid).isString()) {
        logger.error('processGradingResult: invalid gid', msg);
        return mqChannel.ack(msg);
    }
    var serverGrading = serverResult.grading;
    if (!_(serverGrading).isObject()) {
        logger.error('processGradingResult: invalid grading', msg);
        return mqChannel.ack(msg);
    }
    db.gCollect.findOne({gid: gid}, function(err, grading) {
        if (err) {
            logger.error('processGradingResult: error finding grading', msg, e);
            return mqChannel.ack(msg);
        }
        if (!grading) {
            logger.error('processGradingResult: no grading', msg, e);
            return mqChannel.ack(msg);
        }
        db.sCollect.findOne({sid: grading.sid}, function(err, submission) {
            if (err) {
                logger.error('processGradingResult: error finding submission', msg, e);
                return mqChannel.ack(msg);
            }
            if (!submission) {
                logger.error('processGradingResult: no submission', msg, e);
                return mqChannel.ack(msg);
            }

            var score = _.isNumber(serverGrading.score) ? serverGrading.score : 0; // make sure score is a Number
            score = Math.max(0, Math.min(1, score)); // clip to [0, 1]

            grading.score = score;
            grading.feedback = serverGrading.feedback;
            grading.done = true;
            grading.doneDate = new Date();

            if (grading._id !== undefined) delete grading._id;
            db.gCollect.update({gid: grading.gid}, {$set: grading}, {upsert: true, w: 1}, function(err) {
                if (err) {
                    logger.error('processGradingResult: error writing grading', msg, e);
                    return mqChannel.ack(msg);
                }
                testProcessSubmission(submission, grading, function(err) {
                    if (err) {
                        logger.error('processGradingResult: error in testProcessSubmission', msg, e);
                        return mqChannel.ack(msg);
                    }
                    return mqChannel.ack(msg);
                });
            });
        });
    });
};

var mqConnect = function(callback) {
    if (!config.amqpAddress) return callback(null);
    amqp.connect(config.amqpAddress, function(err, conn) {
        if (err) return callback(err);
        conn.createChannel(function(err, ch) {
            if (err) return callback(err);
            ch.assertQueue(config.amqpGradingQueue, {durable: true}, function(err, ok) {
                if (err) return callback(err);
                ch.assertQueue(config.amqpResultQueue, {durable: true}, function(err, ok) {
                    if (err) return callback(err);
                    mqChannel = ch;

                    ch.prefetch(5); // only process up to five messages simultaneously
                    ch.consume(config.amqpResultQueue, processGradingResult);

                    callback(null);
                });
            });
        });
    });
};
