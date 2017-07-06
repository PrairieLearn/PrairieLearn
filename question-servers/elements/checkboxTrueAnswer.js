const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, element_index, question_data, callback) {
    callback(null);
};

module.exports.render = function($, element, element_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');

        if (!question_data.true_answer[name]) {
            return callback(null, 'No true answer for ' + name);
        }

        let trueAnswer = question_data.true_answer[name];
        if (!_.isArray(trueAnswer)) return callback(null, 'Invalid true answer');
        if (trueAnswer.length == 0) return callback(null, 'No answers selected');
        const htmlArray = _.map(trueAnswer, ans => '(' + ans.key + ') ' + ans.html.trim());
        const html = htmlArray.join(', ') + '\n';

        callback(null, html);
    } catch (err) {
        return callback(null, 'checkboxTrueAnswer render error: ' + err);
    }
};
