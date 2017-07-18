const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

module.exports = {};

module.exports.prepare = function($, element, element_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');
        const true_answer = elementHelper.getNumberAttrib(element, 'true_answer', null);
        const sig_figs = elementHelper.getIntegerAttrib(element, 'sig_figs', null);
        if (sig_figs != null && sig_figs <= 0) throw new Error('sig_figs must be positive');
        const dec_places = elementHelper.getIntegerAttrib(element, 'dec_places', null);
        if (dec_places != null && dec_places <= 0) throw new Error('dec_places must be positive');
        const required = elementHelper.getBooleanAttrib(element, 'required', true);

        if (sig_figs == null && dec_places == null) throw new Error('must specify either sig_figs or dec_places');

        question_data.params[name] = {sig_figs, dec_places, required};
        question_data.true_answer[name] = true_answer;
    } catch (err) {
        return callback(err);
    }
    callback(null);
};

module.exports.render = function($, element, element_index, question_data, callback) {
    let html;
    try {
        const name = elementHelper.getAttrib(element, 'name');

        const submittedAnsString = _.get(question_data, ['submitted_answer', name], null);

        html
            = '<input name="' + name + '"'
            + (question_data.editable ? '' : ' disabled')
            + (submittedAnsString == null ? '' : (' value="' + submittedAnsString + '"'))
            + ' >\n';
    } catch (err) {
        return callback(err);
    }
    callback(null, html);
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    const name = elementHelper.getAttrib(element, 'name');
    const weight = elementHelper.getNumberAttrib(element, 'weight', 1);
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
    let grading = {};
    grading[name] = {score: 0};
    if (Math.abs(trueAns - submittedAns) < absTol) {
        grading[name].score = 1;
    }
    grading[name].weight = weight;

    return callback(null, grading);
};
