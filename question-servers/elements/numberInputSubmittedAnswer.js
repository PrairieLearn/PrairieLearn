const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, element_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, element_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');

        if (!question_data.submitted_answer[name]) {
            return callback(null, 'No submitted answer');
        }

        const submittedAnswer = question_data.submitted_answer[name];

        callback(null, submittedAnswer);
    } catch (err) {
        return callback(null, 'inputNumberSubmittedAnswer render error: ' + err);
    }
};
