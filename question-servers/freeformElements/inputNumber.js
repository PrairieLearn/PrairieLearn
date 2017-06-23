const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

const RandomGenerator = require('../../lib/random-generator');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, block_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');
        const true_answer = elementHelper.getAttrib(element, 'true_answer');
        const tolerance = elementHelper.getAttrib(element, 'tolerance', 1);
        const required = elementHelper.getAttrib(element, 'required', true);

        question_data.params[name] = {tolerance, required};
        // FIXME
        //question_data.true_answer[name] = trueAnswer;
        callback(null);
    } catch (err) {
        return callback(err);
    }
};

module.exports.render = function($, element, block_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');
        if (!question_data.params[name]) throw new Error('unable to find params for ' + name);
        const params = question_data.params[name];
        
        let html = '';
        for (const ans of answers) {
            html
                += '<input type="number" name="" step="">\n'
                + '  <label>\n'
                + '    <input type="checkbox" name="' + name + '" value="' + ans.key + '" />\n'
                + '    (' + ans.key + ') ' + ans.html.trim() + '\n'
                + '  </label>\n'
                + '</div>\n';
        }

        callback(null, html);
    } catch (err) {
        return callback(err);
    }
};
