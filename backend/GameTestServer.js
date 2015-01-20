
define(["underscore", "PrairieModel", "numeric", "moment-timezone"], function(_, PrairieModel, numeric, moment) {

    var avgProb = function(qids, qDists, userDist) {
        var totalProb = 0;
        _(qids).each(function(qid) {
            totalProb += PrairieModel.userQuestionProb(userDist, qDists[qid], false).p;
        });
        return totalProb / qids.length;
    };

    var computeMastery = function(qids, qDists, userDist, initAvgProb) {
        return avgProb(qids, qDists, userDist);
    };

    var sigmaCovFactor = 1.5;

    var overrideUserDist = function(userDist) {
        userDist.sigma.covariance = numeric.mul(sigmaCovFactor, numeric.identity(PrairieModel.MODEL_DIM));
    };

    var updateDists = function(correct, userDist, questionDist) {
        PrairieModel.dynamicPrediction(userDist, questionDist);
        PrairieModel.measurementUpdate(correct, userDist, questionDist);
        overrideUserDist(userDist);
    };

    var expectedBenefitAvgProbs = function(qid, userDist, qDists, qids, initAvgProb) {
        var expectedInfo = {};
        var obs = PrairieModel.userQuestionProb(userDist, qDists[qid]);
        expectedInfo.qProb = obs.p;

        var correctUserDist = JSON.parse(JSON.stringify(userDist));
        var correctQuestionDists = JSON.parse(JSON.stringify(qDists));
        updateDists(true, correctUserDist, correctQuestionDists[qid]);

        var incorrectUserDist = JSON.parse(JSON.stringify(userDist));
        var incorrectQuestionDists = JSON.parse(JSON.stringify(qDists));
        updateDists(false, incorrectUserDist, incorrectQuestionDists[qid]);

        var mastery = computeMastery(qids, qDists, userDist, initAvgProb);
        expectedInfo.correctBenefit = computeMastery(qids, correctQuestionDists, correctUserDist, initAvgProb) - mastery;
        expectedInfo.incorrectPenalty = -(computeMastery(qids, incorrectQuestionDists, incorrectUserDist, initAvgProb) - mastery);
        expectedInfo.expectedBenefit = expectedInfo.qProb * expectedInfo.correctBenefit
            - (1 - expectedInfo.qProb) * expectedInfo.incorrectPenalty;

        expectedInfo.expectedBenefit = obs.dPDSigma;

        return expectedInfo;
    };

    var computeModelData = function(qids, qDists, userDist, initAvgProb) {
        var modelData = {};
        modelData.qData = {};
        modelData.mastery = computeMastery(qids, qDists, userDist, initAvgProb);
        _(qids).each(function(qid) {
            var qData = expectedBenefitAvgProbs(qid, userDist, qDists, qids, initAvgProb);
            qData.attempts = PrairieModel.userQuestionAttempts(userDist, qid);
            modelData.qData[qid] = qData;
        });
        var expectedBenefits = _(modelData.qData).pluck("expectedBenefit");
        var maxBenefit = _(expectedBenefits).max();
        var minBenefit = _(expectedBenefits).min();
        var deltaBenefit = Math.max(1e-10, maxBenefit - minBenefit);
        _(qids).each(function(qid) {
            modelData.qData[qid].recommend = (modelData.qData[qid].expectedBenefit - minBenefit + 0.1 * deltaBenefit) / (1.1 * deltaBenefit);
        });
        return modelData;
    };

    var AdaptiveTestServer = {};

    AdaptiveTestServer.getDefaultOptions = function() {
        return {
            autoCreate: true,
            allowQuestionSubmit: true,
        };
    };

    AdaptiveTestServer.updateTest = function(test, options) {
        test.qDists = test.qDists || {};
        _(options.questions).each(function(initDist) {
            var qid = initDist.qid;
            test.qDists[qid] = _.extend(new PrairieModel.QuestionDist(qid), initDist);
        });
        test.qids = _(options.questions).pluck("qid");
        test.dueDate = moment.tz(options.dueDate, options.timezone).format();
        test.availDate = moment.tz(options.availDate, options.timezone).format();
        var userDist = new PrairieModel.UserDist("");
        test.initAvgProb = avgProb(test.qids, test.qDists, userDist)
    };

    AdaptiveTestServer.updateTInstance = function(tInstance, test, options) {
        if (tInstance.dist === undefined) {
            tInstance.dist = new PrairieModel.UserDist(tInstance.uid);
            overrideUserDist(tInstance.dist);
        }
        if (tInstance.modelData === undefined) {
            tInstance.modelData = computeModelData(test.qids, test.qDists, tInstance.dist, test.initAvgProb);
        }
        _(tInstance).defaults({
            score: 0,
        });
        return tInstance;
    };

    AdaptiveTestServer.updateWithSubmission = function(tInstance, test, submission, options) {
        if (submission.practice)
            return;

        var qid = submission.qid;
        if (test.qDists[qid] === undefined)
            throw Error("Invalid QID");
        if (tInstance.dist.uid !== submission.uid)
            throw Error("Mismatched UID");

        var correct = (submission.score >= 0.5);
        updateDists(correct, tInstance.dist, test.qDists[qid]);
        tInstance.modelData = computeModelData(test.qids, test.qDists, tInstance.dist, test.initAvgProb);
        if (Date.now() <= Date.parse(test.dueDate))
            tInstance.score = Math.max(0, Math.min(1, Math.max(tInstance.score, options.scoreFactor * computeMastery(test.qids, test.qDists, tInstance.dist, test.initAvgProb))));
    };

    return AdaptiveTestServer;
});
