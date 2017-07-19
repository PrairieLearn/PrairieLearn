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

        if (!question_data.true_answer[name]) throw new Error('No true answer for ' + name);

        let trueAnswer = question_data.true_answer[name];
        if (!_.isArray(trueAnswer)) throw new Error('Invalid true answer');
        if (trueAnswer.length == 0) throw new Error('No answers selected');
        const htmlArray = _.map(trueAnswer, ans => '(' + ans.key + ') ' + ans.html.trim());
        html = htmlArray.join(', ') + '\n';
    } catch (err) {
        return callback(null, 'checkboxTrueAnswer render error: ' + err);
    }
    callback(null, html);
};

module.exports.parse = function($, element, element_index, question_data, callback) {
    callback(null, question_data);
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    callback(null);
};
