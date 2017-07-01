const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

const RandomGenerator = require('../../lib/random-generator');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, block_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');
        const true_answer = elementHelper.getAttrib(element, 'true_answer');
        const sig_figs = elementHelper.getAttrib(element, 'sig_figs', null);
        const dec_places = elementHelper.getAttrib(element, 'dec_places', null);
        const required = elementHelper.getAttrib(element, 'required', true);

        question_data.params[name] = {sig_figs, dec_places, required};
        question_data.true_answer[name] = true_answer;
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

        let html = '<input name="' + name + '" step="">\n';
        callback(null, html);
    } catch (err) {
        return callback(err);
    }
};
