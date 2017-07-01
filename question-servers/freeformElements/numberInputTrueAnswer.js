const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, block_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, block_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');

        if (!question_data.params[name]) return callback(null, 'No params for ' + name);
        const params = question_data.params[name];

        if (!question_data.true_answer[name]) {
            return callback(null, 'No true answer for ' + name);
        }

        const trueAnswer = question_data.true_answer[name];

        callback(null, trueAnswer);
    } catch (err) {
        return callback(null, 'inputNumberTrueAnswer render error: ' + err);
    }
};
