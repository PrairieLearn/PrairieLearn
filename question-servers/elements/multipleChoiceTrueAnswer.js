const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, element_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, element_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');

        if (!question_data.true_answer[name]) {
            return callback(null, 'No true answer for ' + name);
        }

        const trueAnswer = question_data.true_answer[name];
        const html = '(' + trueAnswer.key + ') ' + trueAnswer.html.trim() + '\n';

        callback(null, html);
    } catch (err) {
        return callback(null, 'multipleChoiceTrueAnswer render error: ' + err);
    }
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    callback(null);
};
