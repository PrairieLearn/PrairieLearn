
define(["underscore", "QServer", "PrairieRandom"], function(_, QServer, PrairieRandom) {

    function MCQServer() {
        QServer.call(this);
    }
    MCQServer.prototype = new QServer();

    MCQServer.prototype.getData = function(vid, options) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var opt = _.defaults(options.options, {
            text: "Question text not defined.",
            correctAnswers: ["Correct answers not defined."],
            incorrectAnswers: ["Incorrect answers not defined."],
            numberAnswers: 5,
        });

        var numberCorrect = 1;
        var numberIncorrect = opt.numberAnswers - numberCorrect;
        numberIncorrect = Math.min(numberIncorrect, opt.incorrectAnswers.length);
        
        var answers = [];
        answers = answers.concat(rand.randNElem(numberCorrect, opt.correctAnswers));
        answers = answers.concat(rand.randNElem(numberIncorrect, opt.incorrectAnswers));
        var perm = rand.shuffle(answers);
        answers = _(answers).map(function(value, index) {
                return {key: String.fromCharCode('a'.charCodeAt() + index), text: value};
        });
        var params = {
            text: opt.text,
            answers: answers,
        };
        var trueIndex = _(perm).indexOf(0);
        var trueAnswer = {
            key: answers[trueIndex].key,
            text: answers[trueIndex].text,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    }

    MCQServer.prototype.transformTrueAnswer = function(vid, params, trueAns) {
        return {key: trueAns.key};
    }

    return MCQServer;
});
