const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, element_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, element_index, question_data, callback) {
    let html;
    try {
        const name = elementHelper.getAttrib(element, 'name');

        if (!question_data.params[name]) throw new Error('No params for ' + name);
        const answers = question_data.params[name];

        if (!question_data.submitted_answer[name]) throw new Error('No submitted answer');

        const submittedKey = question_data.submitted_answer[name];
        const index = _.map(answers, 'key').indexOf(submittedKey);
        const answerHtml = (index < 0) ? 'Error: invalid submission' : answers[index].html;
        html = '(' + submittedKey + ') ' + answerHtml.trim() + '\n';
    } catch (err) {
        return callback(null, 'multipleChoiceSubmittedAnswer render error: ' + err);
    }
    callback(null, html);
};

module.exports.parse = function($, element, element_index, question_data, callback) {
    callback(null, question_data);
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    callback(null);
};
