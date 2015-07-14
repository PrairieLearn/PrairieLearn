
define(["underscore", "QServer", "PrairieRandom"], function(_, QServer, PrairieRandom) {

    function MCQServer() {
        QServer.call(this);
    }
    MCQServer.prototype = new QServer();

    MCQServer.prototype.getData = function(vid, options) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var nCorrect = 1;
        var nIncorrect = Math.min(options.data.nIncorrect || 4, options.data.incorrectAnswers.length);
        var answers = [];
        answers = answers.concat(rand.randNElem(nCorrect, options.data.correctAnswers));
        answers = answers.concat(rand.randNElem(nIncorrect, options.data.incorrectAnswers));
        var perm = rand.shuffle(answers);
        answers = _(answers).map(function(value, index) {
                return {key: String.fromCharCode('a'.charCodeAt() + index), text: value};
        });
        var params = {
            text: options.data.text,
            answers: answers,
        };
        var trueIndex = _(perm).indexOf(0);
        var trueAnswer = {
            key: answers[trueIndex].key,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    }

    return MCQServer;
});
