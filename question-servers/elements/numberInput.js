const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, element_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');
        const weight = elementHelper.getNumberAttrib(element, 'weight', 1);
        const true_answer = elementHelper.getNumberAttrib(element, 'true_answer', null);
        const sig_figs = elementHelper.getIntegerAttrib(element, 'sig_figs', null);
        if (sig_figs != null && sig_figs <= 0) throw new Error('sig_figs must be positive');
        const dec_places = elementHelper.getIntegerAttrib(element, 'dec_places', null);
        if (dec_places != null && dec_places <= 0) throw new Error('dec_places must be positive');
        const required = elementHelper.getBooleanAttrib(element, 'required', true);

        if (sig_figs == null && dec_places == null) throw new Error('must specify either sig_figs or dec_places');

        question_data.params[name] = {sig_figs, dec_places, required, _grade: 'numberInput', _weight: weight};
        question_data.true_answer[name] = true_answer;
        callback(null);
    } catch (err) {
        return callback(err);
    }
};

module.exports.render = function($, element, element_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');

        const submittedAnsString = _.get(question_data, ['submitted_answer', name], null);

        let html
            = '<input name="' + name + '"'
            + (question_data.editable ? '' : ' disabled')
            + (submittedAnsString == null ? '' : (' value="' + submittedAnsString + '"'))
            + ' >\n';
        callback(null, html);
    } catch (err) {
        return callback(err);
    }
};

module.exports.grade = function(name, question_data, question, course, callback) {
    const trueAns = _.get(question_data, ['true_answer', name], null);
    if (trueAns == null) return callback(null, {score: 0});

    const submittedAnsString = _.get(question_data, ['submitted_answer', name], null);
    if (submittedAnsString == null) return callback(null, {score: 0});
    const submittedAns = Number.parseFloat(submittedAnsString);
    if (!Number.isFinite(submittedAns)) return callback(null, {score: 0, feedback: 'not a number'});

    const sig_figs = _.get(question_data, ['params', name, 'sig_figs'], null);
    const dec_places = _.get(question_data, ['params', name, 'dec_places'], null);

    let absTol;
    if (sig_figs != null) {
        absTol = 1.5 * Math.pow(10, Math.floor(Math.log10(trueAns)) - sig_figs + 1);
    } else if (dec_places != null) {
        absTol = 1.5 * Math.pow(10, -dec_places);
    } else {
        return callback(null, {score: 0, feedback: 'invalid precision specification'});
    }
    let grading = {score: 0};
    if (Math.abs(trueAns - submittedAns) < absTol) {
        grading.score = 1;
    }
    return callback(null, grading);
};
