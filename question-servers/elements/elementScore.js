const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, element_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, element_index, question_data, callback) {
    let html;
    try_block: try {
        const name = elementHelper.getAttrib(element, 'name');

        const score = _.get(question_data, ['feedback', '_element_gradings', name, 'score'], null);
        if (score == null) {
            html = '';
            break try_block;
        }
        if (!Number.isFinite(score)) {
            html = '<span class="label label-danger">ERROR: invalid score: ' + score + '</span>';
            break try_block;
        }
        const feedback = _.get(question_data, ['feedback', '_element_gradings', name, 'feedback'], null);

        if (score >= 1) {
            html
                = '<span class="label label-success">'
                + '<i class="fa fa-check" aria-hidden="true"></i>'
                + ' correct: ' + Math.floor(score * 100) + '%'
                + (feedback ? (' (' + feedback + ')') : '')
                + '</span>';
        } else if (score > 0) {
            html
                = '<span class="label label-warning">'
                + '<i class="fa fa-circle-o" aria-hidden="true"></i>'
                + ' partially correct: ' + Math.floor(score * 100) + '%'
                + (feedback ? (' (' + feedback + ')') : '')
                + '</span>';
        } else {
            html
                = '<span class="label label-danger">'
                + '<i class="fa fa-times" aria-hidden="true"></i>'
                + ' incorrect: ' + Math.floor(score * 100) + '%'
                + (feedback ? (' (' + feedback + ')') : '')
                + '</span>';
        }
    } catch (err) {
        callback(new Error('elementScore render error: ' + err));
    }
    callback(null, html);
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    callback(null);
};
