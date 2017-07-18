const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, element_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, element_index, question_data, callback) {
    let html;
    try {
        const name = elementHelper.getAttrib(element, 'name');

        if (!question_data.submitted_answer[name]) throw new Error('No submitted answer');

        const submittedAnswer = question_data.submitted_answer[name];
        html = submittedAnswer;
    } catch (err) {
        return callback(null, 'inputNumberSubmittedAnswer render error: ' + err);
    }
    callback(null, html);
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    callback(null);
};
