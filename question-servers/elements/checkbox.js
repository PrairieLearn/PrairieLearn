const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

const RandomGenerator = require('../../lib/random-generator');

module.exports = {};

module.exports.prepare = function($, element, element_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');

        let correctAnswers = [];
        let incorrectAnswers = [];
        for (const answer of $(element).find('answer').toArray()) {
            const correct = elementHelper.getBooleanAttrib(answer, 'correct', false);
            const html = $(answer).html();
            if (correct) {
                correctAnswers.push(html);
            } else {
                incorrectAnswers.push(html);
            }
        }

        var rand = new RandomGenerator(question_data.variant_seed + element_index * 37);

        const numberCorrect = correctAnswers.length;
        const numberIncorrect = incorrectAnswers.length;

        // FIXME: allow numberAnswers to be passed as an attribute to checkbox
        // var numberIncorrect = options.numberAnswers - numberCorrect;
        // numberIncorrect = Math.min(numberIncorrect, options.incorrectAnswers.length);

        let answers = [];
        answers = answers.concat(rand.randNElem(numberCorrect, correctAnswers));
        answers = answers.concat(rand.randNElem(numberIncorrect, incorrectAnswers));
        const perm = rand.shuffle(answers);
        answers = _.map(answers, (value, index) => {
            return {key: String.fromCharCode('a'.charCodeAt() + index), html: value};
        });
        const trueIndexes = _.map(_.range(numberCorrect), i => perm.indexOf(i));
        let trueAnswer = _.map(trueIndexes, i => answers[i]);
        trueAnswer = _.sortBy(trueAnswer, 'key');

        question_data.params[name] = answers;
        question_data.true_answer[name] = trueAnswer;
    } catch (err) {
        return callback(err);
    }
    callback(null);
};

module.exports.render = function($, element, element_index, question_data, callback) {
    let html;
    try {
        const name = elementHelper.getAttrib(element, 'name');
        const inline = elementHelper.getBooleanAttrib(element, 'inline', false);
        if (!question_data.params[name]) throw new Error('unable to find params for ' + name);
        const answers = question_data.params[name];

        let submittedKeys = _.get(question_data, ['submitted_answer', name], []);
        if (!_.isArray(submittedKeys)) submittedKeys = [submittedKeys];

        html = '';
        if (inline) html += '<p>\n';
        for (const ans of answers) {
            if (!inline) html += '<div class="checkbox">\n';
            html
                += '  <label' + (inline ? ' class="checkbox-inline"' : '') + '>\n'
                + '    <input type="checkbox"'
                + ' name="' + name + '" value="' + ans.key + '"'
                + (question_data.editable ? '' : ' disabled')
                + (submittedKeys.includes(ans.key) ? ' checked ' : '')
                + ' />\n'
                + '    (' + ans.key + ') ' + ans.html.trim() + '\n'
                + '  </label>\n';
            if (!inline) html += '</div>\n';
        }
        if (inline) html += '</p>\n';
    } catch (err) {
        return callback(err);
    }
    callback(null, html);
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    const name = elementHelper.getAttrib(element, 'name');
    const weight = elementHelper.getNumberAttrib(element, 'weight', 1);
    let trueAnswer = _.get(question_data, ['true_answer', name], null);
    if (trueAnswer == null) return callback(null, {score: 0});

    const trueKeys = _.map(trueAnswer, 'key');
    let submittedKeys = _.get(question_data, ['submitted_answer', name], []);
    if (!_.isArray(submittedKeys)) submittedKeys = [submittedKeys];

    let grading = {};
    grading[name] = {};
    if (_.isEqual(trueKeys, submittedKeys)) {
        grading[name].score = 1;
    } else {
        grading[name].score = 0;
    }
    grading[name].weight = weight;

    return callback(null, grading);
};
