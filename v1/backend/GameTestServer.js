var _ = require("underscore");
var moment = require("moment-timezone");
var db = require("./db");

exports.getDefaultOptions = function() {
    return {
        allowQuestionSubmit: true,
    };
};

exports.updateTest = function(test, options) {
    test.qids = _(options.questions).pluck("qid");
    test.availDate = moment.tz(options.availDate, options.timezone).format();
    test.qParams = _(options.questions).indexBy('qid');
    test.maxScore = options.maxScore;
    test.maxQScoresByQID = _.chain(options.questions)
        .map(function(q) {return [q.qid, q.maxScore];})
        .object()
        .value();
    test.text = options.text;
};

exports.updateTInstance = function(tInstance, test, options, questionDB) {
    if (_(tInstance).has('score') && !_(tInstance).has('scorePerc')) {
        // upgrade a score to a scorePerc, without applying credit limits
        tInstance.scorePerc = Math.floor(tInstance.score / test.maxScore * 100);
    }
    _(tInstance).defaults({
        score: 0,
        scorePerc: 0,
        qData: {},
    });
    _(options.questions).forEach(function(question) {
        tInstance.qData[question.qid] = tInstance.qData[question.qid] || {};
        tInstance.qData[question.qid].value = tInstance.qData[question.qid].value || 0;
        tInstance.qData[question.qid].score = tInstance.qData[question.qid].score || 0;

        tInstance.qData[question.qid].value = Math.max(tInstance.qData[question.qid].value, question.initValue);
        tInstance.qData[question.qid].score = Math.min(tInstance.qData[question.qid].score, question.maxScore);
    });
    tInstance.questions = [];
    _(test.qids).each(function(qid) {
        tInstance.questions.push({
            qid: qid,
            title: questionDB[qid] && questionDB[qid].title,
        });
    });
    return tInstance;
};

exports.updateWithSubmission = function(tInstance, test, submission, options, callback) {
    var qid = submission.qid;
    if (!_(test.qids).contains(qid)) {
        return callback(new Error("Invalid QID"));
    }

    var qiid = submission.qiid;
    db.sCollect.findOne({qiid: qiid}, function(err, existingSubmission) {
        if (existingSubmission) {
            return callback(new Error("Submission already exists for this question"));
        }

        if (_(test.credit).isFinite() && test.credit > 0) {
            var correct = (submission.score >= 0.5);
            var qData = tInstance.qData[qid];
            if (correct) {
                qData.score += qData.value;
                qData.score = Math.min(qData.score, test.qParams[qid].maxScore);
                qData.value += test.qParams[qid].initValue;
            } else {
                qData.value = test.qParams[qid].initValue;
            }

            // compute the score in points, maxing out at maxScore
            var maxScore = options.maxScore;
            newScore = _.chain(tInstance.qData).pick(test.qids).pluck('score').reduce(function(a, b) {return a + b;}, 0).value();
            newScore = Math.min(newScore, maxScore);
            tInstance.score = newScore;

            // compute the score as a percentage, applying credit bonus/limits
            newScorePerc = Math.floor(newScore / maxScore * 100);
            if (test.credit < 100) {
                newScorePerc = Math.min(newScorePerc, test.credit);
            }
            if (test.credit > 100 && newScore == maxScore) {
                newScorePerc = test.credit;
            }
            tInstance.scorePerc = Math.max(tInstance.scorePerc, newScorePerc);
        }

        callback(null);
    });

};
