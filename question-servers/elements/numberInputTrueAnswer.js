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

        const params = _.get(question_data, ['params', name], null);
        if (params == null) throw new Error('No params for ' + name);

        const trueAnswer = _.get(question_data, ['true_answer', name], null);
        if (trueAnswer == null) throw new Error('No true answer for ' + name);

        html = String(trueAnswer);
    } catch (err) {
        return callback(null, 'inputNumberTrueAnswer render error: ' + err);
    }
    callback(null, html);
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    callback(null);
};
