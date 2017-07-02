const _ = require('lodash');
const elementHelper = require('../../lib/element-helper');

const RandomGenerator = require('../../lib/random-generator');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, block_index, question_data, callback) {
    try {
        const name = elementHelper.getAttrib(element, 'name');
        const weight = elementHelper.getNumberAttrib(element, 'weight', 1);

        var rand = new RandomGenerator(variant_seed + block_index * 37);
        
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
        question_data.params._gradeSubmission[name] = 'multipleChoice';
        question_data.params._weights[name] = weight;
        if (_.has(question_data.true_answer, name)) return callback(new Error('Duplicate use of name for true_answer: "' + name + '"'));
        question_data.true_answer[name] = trueAnswer;

        callback(null);
    } catch (err) {
        return callback(new Error('multipleChoice prepare error: ' + err));
    }
};

module.exports.render = function($, element, block_index, question_data, callback) {
    try {
        if (!element.attribs.name) return callback(new Error('"name" not specified for multipleChoice'));
        const name = element.attribs.name;

        if (!question_data.params[name]) return callback(null, 'No params for ' + name);
        const answers = question_data.params[name];
        
        var html = '';
        for (const ans of answers) {
            html
                += '<div class="radio">\n'
                + '  <label>\n'
                + '    <input type="radio" name="' + name + '" value="' + ans.key + '" />\n'
                + '    (' + ans.key + ') ' + ans.html.trim() + '\n'
                + '  </label>\n'
                + '</div>\n';
        }

        callback(null, html);
    } catch (err) {
        return callback(null, 'multipleChoice render error: ' + err);
    }
};

module.exports.gradeSubmission = function(name, question_data, question, course, callback) {
    try {
        const submittedKey = _.get(question_data, ['submitted_answer', name], null);
        const trueKey = _.get(question_data, ['true_answer', name, 'key'], null);
        if (submittedKey == null || trueKey == null) return callback(null, {score: 0});

        let grading = {};
        if (trueKey == submittedKey) {
            grading.score = 1;
        } else {
            grading.score = 0;
        }

        callback(null, grading);
    } catch (err) {
        return callback(null, 'multipleChoice gradeSubmission error: ' + err);
    }
};
