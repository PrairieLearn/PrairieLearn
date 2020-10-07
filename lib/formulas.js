const _ = require('lodash');

const formulas = module.exports;

formulas.calcQuestionScore = (partialScores, partialCredit) => {
    let questionScore = 0;
    if (partialCredit) {
        let total_weight = 0, total_weight_score = 0;
        _.each(partialScores, value => {
            const partialScore = _.get(value, 'score', 0);
            const weight = _.get(value, 'weight', 1);
            total_weight += weight;
            total_weight_score += weight * partialScore;
        });
        questionScore = total_weight_score / (total_weight == 0 ? 1 : total_weight);
    } else {
        if (_.size(partialScores) > 0 && _.every(partialScores, value => _.get(value, 'score', 0) >= 1)) {
            questionScore = 1;
        }
    }
    return questionScore;
};

formulas.calcAssessmentScore = (...assessment_score_args) => {
    console.log(assessment_score_args);
    return null;
};