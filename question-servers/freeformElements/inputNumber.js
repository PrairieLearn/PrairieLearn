const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

const RandomGenerator = require('../../lib/random-generator');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, block_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');
        const true_answer = elementHelper.getAttrib(element, 'true_answer');
        const sig_figs = elementHelper.getAttrib(element, 'sig_figs', 3);
        const required = elementHelper.getAttrib(element, 'required', true);

        question_data.params[name] = {sig_figs, required};
        question_data.true_answer[name] = true_answer;
        console.log('inputNumber.prepare about to callback a');
        callback(null);
    } catch (err) {
        console.log('inputNumber.prepare about to callback b', err);
        return callback(err);
    }
};

module.exports.render = function($, element, block_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');
        if (!question_data.params[name]) throw new Error('unable to find params for ' + name);
        const params = question_data.params[name];

        let html = '<input name="' + name + '" step="">\n';
        console.log('inputNumber.render about to callback a');
        callback(null, html);
    } catch (err) {
        console.log('inputNumber.render about to callback b', err);
        return callback(err);
    }
};
