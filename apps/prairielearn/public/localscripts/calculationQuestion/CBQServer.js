define(['underscore', 'QServer', 'PrairieRandom'], function (_, QServer, PrairieRandom) {
  function CBQServer() {
    QServer.call(this);
  }
  CBQServer.prototype = new QServer();

  CBQServer.prototype.getData = function (vid, options) {
    var rand = new PrairieRandom.RandomGenerator(vid);
    options = _.defaults(options, {
      text: 'Question text not defined.',
      correctAnswers: ['Correct answers not defined.'],
      incorrectAnswers: ['Incorrect answers not defined.'],
      numberAnswers: 5,
      minCorrectAnswers: 1,
      maxCorrectAnswers: 3,
    });

    // we can't choose more correct answers than we have
    var maxNumberCorrect = Math.min(options.maxCorrectAnswers, options.correctAnswers.length);

    // we need to choose at least this many correct answers to ensure we can make the total number
    var minNumberCorrect = Math.max(
      options.minCorrectAnswers,
      options.numberAnswers - options.incorrectAnswers.length,
    );

    // but we must have minNumber <= maxNumber
    minNumberCorrect = Math.min(minNumberCorrect, maxNumberCorrect);

    // actually pick the number of correct answers
    var numberCorrect = rand.randInt(minNumberCorrect, maxNumberCorrect);

    // compute the number of incorrect answers we need based on the desired total
    var numberIncorrect = options.numberAnswers - numberCorrect;

    // but we can't choose more incorrect answers than we have
    numberIncorrect = Math.min(numberIncorrect, options.incorrectAnswers.length);

    var answers = [];
    answers = answers.concat(rand.randNElem(numberCorrect, options.correctAnswers));
    answers = answers.concat(rand.randNElem(numberIncorrect, options.incorrectAnswers));
    var perm = rand.shuffle(answers);
    answers = _(answers).map(function (value, index) {
      return {
        key: String.fromCharCode('a'.charCodeAt() + index),
        text: value,
      };
    });
    var params = {
      text: options.text,
      answers: answers,
    };
    var trueIndexes = _.range(numberCorrect)
      .map(function (i) {
        return _(perm).indexOf(i);
      })
      .sort();
    var trueAnswer = {
      correctAnswers: _(trueIndexes).map(function (i) {
        return answers[i];
      }),
    };
    var questionData = {
      params: params,
      trueAnswer: trueAnswer,
    };
    return questionData;
  };

  CBQServer.prototype.transformTrueAnswer = function (vid, params, trueAns) {
    var trueAnsKeys = _(trueAns.correctAnswers).pluck('key');
    var checkTrueAns = {};
    _(params.answers).each(function (answer) {
      checkTrueAns[answer.key] = _(trueAnsKeys).contains(answer.key);
    });
    return checkTrueAns;
  };

  return CBQServer;
});
