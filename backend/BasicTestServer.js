
define(["underscore", "moment-timezone"], function(_, moment) {

    var BasicTestServer = {};

    BasicTestServer.getDefaultOptions = function() {
        return {
            autoCreate: true,
        };
    };

    BasicTestServer.updateTest = function(test, options) {
        test.qids = options.qids;
        test.dueDate = moment.tz(options.dueDate, options.timezone).format();
        test.availDate = moment.tz(options.availDate, options.timezone).format();
    };

    BasicTestServer.updateTInstance = function(tInstance, test, options) {
        _(tInstance).defaults({
            qData: {},
            score: 0,
        });
    };

    BasicTestServer.updateWithSubmission = function(tInstance, test, submission, options) {
        if (submission.practice)
            return;

        var qid = submission.qid;
        if (!_(test.qids).contains(qid))
            throw Error("Invalid QID");
        if (tInstance.uid !== submission.uid)
            throw Error("Mismatched UID");

        // per-question score is average of score of all attempts
        if (tInstance.qData[qid] === undefined)
            tInstance.qData[qid] = {nAttempt: 0, avgScore: 0, minScore: 1, maxScore: 0};
        var d = tInstance.qData[qid];
        d.nAttempt++;
        d.avgScore = d.avgScore * (d.nAttempt - 1) / d.nAttempt + submission.score / d.nAttempt;
        d.minScore = Math.min(d.minScore, submission.score);
        d.maxScore = Math.max(d.maxScore, submission.score);

        // overall test score is average of per-question scores
        if (Date.now() <= Date.parse(test.dueDate)) {
            tInstance.score = _(test.qids).reduce(function(memo, qid) {
                return memo + ((tInstance.qData[qid] === undefined) ? 0 : tInstance.qData[qid].avgScore);
            }, 0) / test.qids.length;
        }
    };

    return BasicTestServer;
});
