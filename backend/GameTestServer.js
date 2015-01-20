
define(["underscore", "moment-timezone"], function(_, moment) {

    var GameTestServer = {};

    GameTestServer.getDefaultOptions = function() {
        return {
            autoCreate: true,
            allowQuestionSubmit: true,
        };
    };

    GameTestServer.updateTest = function(test, options) {
        test.qids = _(options.questions).pluck("qid");
        test.dueDate = moment.tz(options.dueDate, options.timezone).format();
        test.availDate = moment.tz(options.availDate, options.timezone).format();
        test.qParams = _(options.questions).indexBy('qid');
        test.maxScore = options.maxScore;
    };

    GameTestServer.updateTInstance = function(tInstance, test, options) {
        _(tInstance).defaults({
            score: 0,
            qData: {},
        });
        _(options.questions).forEach(function(question) {
            tInstance.qData[question.qid] = tInstance.qData[question.qid] || {};
            tInstance.qData[question.qid].value = tInstance.qData[question.qid].value || 0;
            tInstance.qData[question.qid].score = tInstance.qData[question.qid].score || 0;

            tInstance.qData[question.qid].value = Math.max(tInstance.qData[question.qid].value, question.initValue);
            tInstance.qData[question.qid].score = Math.min(tInstance.qData[question.qid].score, question.maxScore);
        });
        return tInstance;
    };

    GameTestServer.updateWithSubmission = function(tInstance, test, submission, options) {
        var qid = submission.qid;
        if (!_(test.qids).contains(qid))
            throw Error("Invalid QID");

        if (Date.now() <= Date.parse(test.dueDate)) {
            var correct = (submission.score >= 0.5);
            var qData = tInstance.qData[qid];
            if (correct) {
                qData.score += qData.value;
                qData.score = Math.min(qData.score, test.qParams[qid].maxScore);
                qData.value += test.qParams[qid].initValue;
            } else {
                qData.value = test.qParams[qid].initValue;
            }
            tInstance.score = _.chain(tInstance.qData).pick(test.qids).pluck('score').reduce(function(a, b) {return a + b;}, 0).value();
            tInstance.score = Math.min(tInstance.score, options.maxScore);
        }
    };

    return GameTestServer;
});
