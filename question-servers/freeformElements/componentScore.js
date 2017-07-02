const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, block_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, block_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');

        const score = _.get(question_data, ['feedback', '_component_scores', name], null);
        if (score == null) {
            return callback(null, '<span class="label label-default">No score</span>');
        }
        if (!Number.isFinite(score)) {
            return callback(null, '<span class="label label-danger">ERROR: invalid score: ' + score + '</span>');
        }
        const feedback = _.get(question_data, ['feedback', '_component_feedbacks', name], null);

        let labelType;
        if (score >= 1) {
            return callback(null,
                            '<span class="label label-success">'
                            + '<i class="fa fa-check" aria-hidden="true"></i>'
                            + ' correct: ' + Math.floor(score * 100) + '%'
                            + (feedback ? (' (' + feedback + ')') : '')
                            + '</span>');
        } else if (score > 0) {
            return callback(null,
                            '<span class="label label-warning">'
                            + '<i class="fa fa-circle-o" aria-hidden="true"></i>'
                            + ' partially correct: ' + Math.floor(score * 100) + '%'
                            + (feedback ? (' (' + feedback + ')') : '')
                            + '</span>');
        } else {
            return callback(null,
                            '<span class="label label-danger">'
                            + '<i class="fa fa-times" aria-hidden="true"></i>'
                            + ' incorrect: ' + Math.floor(score * 100) + '%'
                            + (feedback ? (' (' + feedback + ')') : '')
                            + '</span>');
        }
    } catch (err) {
        callback(new Error('componentScore render error: ' + err));
    }
};
