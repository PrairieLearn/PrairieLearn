
define(["underscore", "PrairieModel"], function(_, PrairieModel) {

    var common = {};

    common.avgProb = function(qids, qDists, userDist) {
        var totalProb = 0;
        _(qids).each(function(qid) {
            totalProb += PrairieModel.userQuestionProb(userDist, qDists[qid], false).p;
        });
        return totalProb / qids.length;
    };

    common.maxProb = 0.905;

    common.scoreFactor = 1.2;

    common.computeMastery = function(qids, qDists, userDist, initAvgProb) {
        return this.avgProb(qids, qDists, userDist) / this.maxProb;
    };

    common.sigmaCovFactor = 1.5;

    common.overrideUserDist = function(userDist) {
        userDist.sigma.covariance = numeric.mul(this.sigmaCovFactor, numeric.identity(PrairieModel.MODEL_DIM));
    };

    common.updateDists = function(correct, userDist, questionDist) {
        PrairieModel.dynamicPrediction(userDist, questionDist);
        PrairieModel.measurementUpdate(correct, userDist, questionDist);
        this.overrideUserDist(userDist);
    };

    return common;
 });
