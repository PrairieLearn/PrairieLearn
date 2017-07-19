const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, element_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, element_index, question_data, callback) {
    let html;
    try {
        const name = elementHelper.getAttrib(element, 'name');

        if (!question_data.true_answer[name]) throw new Error('No true answer for ' + name);

        const trueAnswer = question_data.true_answer[name];
        html = '(' + trueAnswer.key + ') ' + trueAnswer.html.trim() + '\n';
    } catch (err) {
        return callback(null, 'multipleChoiceTrueAnswer render error: ' + err);
    }
    callback(null, html);
};

module.exports.parse = function($, element, element_index, question_data, callback) {
    callback(null, question_data);
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    callback(null);
};
