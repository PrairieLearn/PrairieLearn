const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, element_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, element_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');

        const params = _.get(question_data, ['params', name], null);
        if (params == null) return callback(null, 'No params for ' + name);

        const trueAnswer = _.get(question_data, ['true_answer', name], null);
        if (trueAnswer == null) return callback(null, 'No true answer for ' + name);

        callback(null, String(trueAnswer));
    } catch (err) {
        return callback(null, 'inputNumberTrueAnswer render error: ' + err);
    }
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    callback(null);
};
