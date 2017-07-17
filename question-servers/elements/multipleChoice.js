const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

const RandomGenerator = require('../../lib/random-generator');

module.exports = {};

module.exports.prepare = function($, element, element_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');

        var rand = new RandomGenerator(question_data.variant_seed + element_index * 37);
        
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
        if (correctAnswers.length < 1) return callback(new Error('multipleChoice must have a correct answer'));

        const numberCorrect = 1;
        const numberIncorrect = incorrectAnswers.length;

        // FIXME: allow numberAnswers to be passed as an attribute to multipleChoice
        // var numberIncorrect = options.numberAnswers - numberCorrect;
        // numberIncorrect = Math.min(numberIncorrect, options.incorrectAnswers.length);
        
        let answers = [];
        answers = answers.concat(rand.randNElem(numberCorrect, correctAnswers));
        answers = answers.concat(rand.randNElem(numberIncorrect, incorrectAnswers));
        let perm = rand.shuffle(answers);
        answers = _.map(answers, (value, index) => {
            return {key: String.fromCharCode('a'.charCodeAt() + index), html: value};
        });
        var trueIndex = _.indexOf(perm, 0);
        var trueAnswer = {
            key: answers[trueIndex].key,
            html: answers[trueIndex].html,
        };

        if (_.has(question_data.params, name)) return callback(new Error('Duplicate use of name for params: "' + name + '"'));
        question_data.params[name] = answers;
        if (_.has(question_data.true_answer, name)) return callback(new Error('Duplicate use of name for true_answer: "' + name + '"'));
        question_data.true_answer[name] = trueAnswer;

        callback(null);
    } catch (err) {
        return callback(new Error('multipleChoice prepare error: ' + err));
    }
};

module.exports.render = function($, element, element_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');
        const inline = elementHelper.getBooleanAttrib(element, 'inline', false);

        if (!question_data.params[name]) return callback(null, 'No params for ' + name);
        const answers = question_data.params[name];
        
        const submittedKey = _.get(question_data, ['submitted_answer', name], null);

        var html = '';
        if (inline) html += '<p>\n';
        for (const ans of answers) {
            if (!inline) html += '<div class="radio">\n';
            html
                += '  <label' + (inline ? ' class="radio-inline"' : '') + '>\n'
                + '    <input type="radio"'
                + ' name="' + name + '" value="' + ans.key + '"'
                + (question_data.editable ? '' : ' disabled')
                + ((submittedKey == ans.key) ? ' checked ' : '')
                + ' />\n'
                + '    (' + ans.key + ') ' + ans.html.trim() + '\n'
                + '  </label>\n';
            if (!inline) html += '</div>\n';
        }
        if (inline) html += '</p>\n';

        callback(null, html);
    } catch (err) {
        return callback(null, 'multipleChoice render error: ' + err);
    }
};

module.exports.grade = function($, element, element_index, question_data, callback) {
    const name = elementHelper.getAttrib(element, 'name');
    const weight = elementHelper.getNumberAttrib(element, 'weight', 1);
    const submittedKey = _.get(question_data, ['submitted_answer', name], null);
    const trueKey = _.get(question_data, ['true_answer', name, 'key'], null);
    if (submittedKey == null || trueKey == null) {
        return callback(null, {score: 0});
    }

    let grading = {};
    grading[name] = {};
    if (trueKey == submittedKey) {
        grading[name].score = 1;
    } else {
        grading[name].score = 0;
    }
    grading[name].weight = weight;

    callback(null, grading);
};
