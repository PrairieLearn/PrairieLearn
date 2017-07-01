const _ = require('lodash');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, block_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, block_index, question_data, callback) {
    try {
        if (!element.attribs.name) return callback(new Error('"name" not specified for componentScore'));
        const name = element.attribs.name;

        if (!question_data.feedback || !question_data.feedback['component_scores']) {
            return callback(null, '<span class="label label-default">No score</span>');
        }

        const score = question_data.feedback['component_scores'];
        if (!Number.isFinite(score)) {
            return callback(null, '<span class="label label-danger">ERROR: invalid score: ' + score + '</span>');
        }

        let labelType;
        if (score >= 1) {
            return callback(null,
                            '<span class="label label-success">'
                            + '<i class="fa fa-check" aria-hidden="true"></i>'
                            + ' correct: ' + (score * 100).floor() + '%'
                            + '</span>');
        } else if (score > 0) {
            return callback(null,
                            '<span class="label label-warning">'
                            + '<i class="fa fa-circle-o" aria-hidden="true"></i>'
                            + ' partially correct: ' + (score * 100).floor() + '%'
                            + '</span>');
        } else {
            return callback(null,
                            '<span class="label label-danger">'
                            + '<i class="fa fa-times" aria-hidden="true"></i>'
                            + ' incorrect: ' + (score * 100).floor() + '%'
                            + '</span>');
        }
    } catch (err) {
        callback(new Error('componentScore render error: ' + err));
    }
};
