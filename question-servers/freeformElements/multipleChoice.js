const _ = require('lodash');

const RandomGenerator = require('../../lib/random-generator');

module.exports = {};

module.exports.prepare = function($, element, variant_seed, block_index, question_data, callback) {
    if (!element.attribs.name) return callback(new Error('"name" not specified for multipleChoice'));
    const name = element.attribs.name;

    var rand = new RandomGenerator(variant_seed + block_index);
    
    let correctAnswers = [];
    let incorrectAnswers = [];
    for (const answer of $(element).find('answer').toArray()) {
        if (!answer.attribs.correct) return callback(new Error('"correct" value not specified for multipleChoice answer'));
        const html = $(answer).html();
        if (answer.attribs.correct == 'true') {
            correctAnswers.push(html);
        } else if (answer.attribs.correct == 'false') {
            incorrectAnswers.push(html);
        } else {
            return callback(new Error('"correct" value must be "true" or "false"'));
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
    // let perm = rand.shuffle(answers);
    rand.shuffle(answers);
    answers = _.map(answers, (value, index) => {
        return {key: String.fromCharCode('a'.charCodeAt() + index), html: value};
    });
    /*
    var trueIndex = _.indexOf(perm, 0);
    var trueAnswer = {
        key: answers[trueIndex].key,
        _html: answers[trueIndex].html,
    };
    */

    question_data.params[name] = answers;
    // FIXME
    //question_data.true_answer[name] = trueAnswer;

    callback(null);
};

module.exports.render = function($, element, block_index, question_data, callback) {
    if (!element.attribs.name) return callback(new Error('"name" not specified for multipleChoice'));
    const name = element.attribs.name;

    if (!question_data.params[name]) return callback(new Error('unable to find params for ' + name));
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
};
