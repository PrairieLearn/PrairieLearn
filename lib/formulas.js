const _ = require('lodash');

const formulas = module.exports;

formulas.calcQuestionScore = (partialScores, partialCredit = true) => {
    let score;
    if (partialCredit) {
        let total_weight = 0, total_weight_score = 0;
        _.each(partialScores, value => {
            const score = _.get(value, 'score', 0);
            const weight = _.get(value, 'weight', 1);
            total_weight += weight;
            total_weight_score += weight * score;
        });
        score = total_weight_score / (total_weight == 0 ? 1 : total_weight);
    } else {
        if (_.size(partialScores) > 0 && _.every(partialScores, value => _.get(value, 'score', 0) >= 1)) {
            score = 1;
        }
    }
    return score;
};

