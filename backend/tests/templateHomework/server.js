
define(["underscore"], function(_) {

    var qids = [
        "templateCalculation",
        "templateMCCheckbox",
        "templateMCRadio",
    ];

    var availDate = new Date(2014, 3, 14, 23, 59, 59).toJSON();
    var dueDate = new Date(2018, 8, 1, 23, 59, 59).toJSON();

    var server = {};

    server.initTestData = function(testData) {
        testData.qids = qids;
        testData.availDate = availDate;
        testData.dueDate = dueDate;
    };

    server.initUserData = function(uid) {
        var userData = {};
        userData.qData = {};
        userData.score = 0;
        userData.availDate = availDate;
        return userData;
    };

    server.update = function(userData, testData, submission) {
        if (submission.practice)
            return;

        var qid = submission.qid;
        if (!_(testData.qids).contains(qid))
            throw Error("Invalid QID");
        if (userData.uid !== submission.uid)
            throw Error("Mismatched UID");

        // per-question score is average of score of all attempts
        if (userData.qData[qid] === undefined)
            userData.qData[qid] = {nAttempt: 0, avgScore: 0, minScore: 1, maxScore: 0};
        var d = userData.qData[qid];
        d.nAttempt++;
        d.avgScore = d.avgScore * (d.nAttempt - 1) / d.nAttempt + submission.score / d.nAttempt;
        d.minScore = Math.min(d.minScore, submission.score);
        d.maxScore = Math.max(d.maxScore, submission.score);

        // overall test score (average of per-question scores)
        if (Date.now() <= Date.parse(testData.dueDate)) {
            userData.score = _(testData.qids).reduce(function(memo, qid) {
                return memo + ((userData.qData[qid] === undefined) ? 0 : userData.qData[qid].avgScore);
            }, 0) / testData.qids.length;
        }
    };

    return server;
});
