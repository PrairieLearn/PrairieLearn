
define(["underscore", "PrairieModel", "./common.js"], function(_, PrairieModel, common) {

    var questionInitDists = [
        {qid: "centMassPoints",              beta: {mean: 0.0, variance: 0.1}},
        {qid: "particleOnCurveForce",        beta: {mean: 0.4, variance: 0.1}},
        {qid: "massFromCurveRad",            beta: {mean: 0.8, variance: 0.1}},
        {qid: "massBarSeg",                  beta: {mean: 1.2, variance: 0.1}},
        {qid: "rigidFourBodiesCOM",          beta: {mean: 1.6, variance: 0.1}},
        {qid: "centMassPointsPairGraph",     beta: {mean: 2.0, variance: 0.1}},
        {qid: "particleOnCurveForceAcc",     beta: {mean: 2.4, variance: 0.1}},
        {qid: "polarForceToCurvature",       beta: {mean: 2.8, variance: 0.1}},
        {qid: "centMassPointsRI",            beta: {mean: 3.2, variance: 0.1}},
        {qid: "centMassPointsPairRIGraph",   beta: {mean: 3.6, variance: 0.1}},
        {qid: "centMassBarSeg",              beta: {mean: 4.0, variance: 0.1}},
        {qid: "particleOnCurveForceSpeed",   beta: {mean: 4.4, variance: 0.1}},
        {qid: "massAlg2D",                   beta: {mean: 4.8, variance: 0.1}},
        {qid: "particleOnCurveForceDSpeed",  beta: {mean: 5.2, variance: 0.1}},
        {qid: "centMassPointsMI",            beta: {mean: 5.6, variance: 0.1}},
        {qid: "centMassPointsGraph",         beta: {mean: 6.0, variance: 0.1}},
        {qid: "particleOnCurveForceToSpeed", beta: {mean: 6.4, variance: 0.1}},
        {qid: "centMassPointsRIGraph",       beta: {mean: 6.8, variance: 0.1}},
        {qid: "particleOnCurveForceToAcc",   beta: {mean: 7.2, variance: 0.1}},
        {qid: "centMassAlg2D",               beta: {mean: 7.6, variance: 0.1}},
    ];

    var availDate = new Date(2014, 3, 14, 23, 59, 59).toJSON();

    var server = {};

    server.initTestData = function(testData) {
        testData.qDists = testData.qDists || {};
        _(questionInitDists).each(function(initDist) {
            var qid = initDist.qid;
            //if (testData.qDists[qid] === undefined)
            testData.qDists[qid] = _.extend(new PrairieModel.QuestionDist(qid), initDist);
        });
        testData.qids = _(questionInitDists).pluck("qid");
        testData.dueDate = new Date(2014, 3, 21, 23, 59, 59).toJSON();
        testData.availDate = availDate;
        var userDist = new PrairieModel.UserDist("");
        testData.initAvgProb = common.avgProb(testData.qids, testData.qDists, userDist)
    };

    server.initUserData = function(uid) {
        var userData = {};
        userData.dist = new PrairieModel.UserDist(uid);
        common.overrideUserDist(userData.dist);
        userData.score = 0;
        userData.availDate = availDate;
        return userData;
    };

    server.update = function(userData, testData, submission) {
        if (submission.practice)
            return;

        var qid = submission.qid;
        if (testData.qDists[qid] === undefined)
            throw Error("Invalid QID");
        if (userData.dist.uid !== submission.uid)
            throw Error("Mismatched UID");

        var correct = (submission.score >= 0.5);
        common.updateDists(correct, userData.dist, testData.qDists[qid]);
        if (Date.now() <= Date.parse(testData.dueDate))
            userData.score = Math.max(0, Math.min(1, Math.max(userData.score, common.scoreFactor * common.computeMastery(testData.qids, testData.qDists, userData.dist, testData.initAvgProb))));
    };

    return server;
});
