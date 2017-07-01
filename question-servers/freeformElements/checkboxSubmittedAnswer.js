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
        const answers = question_data.params[name];

        if (!question_data.submitted_answer[name]) {
            return callback(null, 'No answers selected');
        }

        const submittedKeys = question_data.submitted_answer[name];
        if (!_.isArray(submittedKeys)) return callback(null, 'Error: bad format: ' + submittedKeys);
        if (submittedKeys.length == 0) return callback(null, 'No answers selected');
        let htmlArray = [];
        for (let key of submittedKeys) {
            const index = _.map(answers, 'key').indexOf(key);
            const answerHtml = (index < 0) ? 'Error: invalid submission' : answers[index].html;
            htmlArray.push('(' + key + ') ' + answerHtml.trim());
        }
        const html = htmlArray.join(', ') + '\n';

        callback(null, html);
    } catch (err) {
        return callback(null, 'checkboxSubmittedAnswer render error: ' + err);
    }
};
