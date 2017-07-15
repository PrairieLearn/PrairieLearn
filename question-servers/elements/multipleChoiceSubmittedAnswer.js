const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, element_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, element_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');

        if (!question_data.params[name]) return callback(null, 'No params for ' + name);
        const answers = question_data.params[name];

        if (!question_data.submitted_answer[name]) {
            return callback(null, 'No submitted answer');
        }

        const submittedKey = question_data.submitted_answer[name];
        const index = _.map(answers, 'key').indexOf(submittedKey);
        const answerHtml = (index < 0) ? 'Error: invalid submission' : answers[index].html;
        const html = '(' + submittedKey + ') ' + answerHtml.trim() + '\n';

        callback(null, html);
    } catch (err) {
        return callback(null, 'multipleChoiceSubmittedAnswer render error: ' + err);
    }
};
