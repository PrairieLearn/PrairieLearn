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

        if (!question_data.submitted_answer[name]) throw new Error('No answers selected');

        let submittedKeys = question_data.submitted_answer[name];
        if (!_.isArray(submittedKeys)) submittedKeys = [submittedKeys];
        if (submittedKeys.length == 0) throw new Error('No answers selected');
        let htmlArray = [];
        for (let key of submittedKeys) {
            const index = _.map(answers, 'key').indexOf(key);
            const answerHtml = (index < 0) ? 'Error: invalid submission' : answers[index].html;
            htmlArray.push('(' + key + ') ' + answerHtml.trim());
        }
        html = htmlArray.join(', ') + '\n';
    } catch (err) {
        return callback(null, 'checkboxSubmittedAnswer render error: ' + err);
    }
    callback(null, html);
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    callback(null);
};
