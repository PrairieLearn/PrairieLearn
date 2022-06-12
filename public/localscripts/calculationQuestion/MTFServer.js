define(['underscore', 'QServer', 'PrairieRandom'], function (_, QServer, PrairieRandom) {
  function MTFServer() {
    QServer.call(this);
  }
  MTFServer.prototype = new QServer();

  MTFServer.prototype.getData = function (vid, options) {
    var rand = new PrairieRandom.RandomGenerator(vid);

    // Set some default values first.
    // Missing values should be caught by the schemas.
    options = _.defaults(options, {
      text: '',
      trueStatements: [],
      falseStatements: [],
      correctScore: 1,
      incorrectScore: 0,
      guessingPenalty: 0,
    });

    var numberTrue = options.trueStatements.length;
    var numberFalse = options.falseStatements.length;

    var allStatements = [];
    allStatements = allStatements.concat(options.trueStatements);
    allStatements = allStatements.concat(options.falseStatements);

    // For every index we have, if it's less than the length of true list,
    // we deem it a true statement. Else, it's false.
    var trueAnswer = [];
    for (var i = 0; i < allStatements.length; i++) {
      trueAnswer.push(i < options.trueStatements.length);
    }

    var perm = rand.shuffle(allStatements, trueAnswer);
    allStatements = _(allStatements).map(function (value, index) {
      return { key: 'q' + index.toString(), statement: value };
    });

    var params = {
      statements: allStatements,
      text: options.text,
    };

    var questionData = {
      params: params,
      trueAnswer: { correctAnswers: trueAnswer },
    };

    return questionData;
  };

  MTFServer.prototype.gradeAnswer = function (vid, params, trueAnswer, submittedAnswer, options) {
    trueAnswer = trueAnswer.correctAnswers;
    var finalScore = 0.0;
    var maxScore = options.correctScore * trueAnswer.length;

    // Assumptions:
    //  trueAnswer[i]: T, submittedAnswer[qi-true]: T -> Correct
    //  trueAnswer[i]: F, submittedAnswer[qi-false]: T -> Correct
    //  Else: Incorrect
    for (var i = 0; i < trueAnswer.length; i++) {
      var questionId = 'q' + i.toString();

      if (
        (trueAnswer[i] && submittedAnswer[questionId + '-true']) ||
        (!trueAnswer[i] && submittedAnswer[questionId + '-false'])
      ) {
        finalScore += options.correctScore;
      } else if (submittedAnswer[questionId + '-true'] || submittedAnswer[questionId + '-false']) {
        finalScore = finalScore + (options.incorrectScore + options.guessingPenalty);
      } else {
        finalScore += options.incorrectScore;
      }
    }

    // We floor the questions's final score to 0.
    finalScore = Math.max(finalScore / maxScore, 0.0);
    return { score: finalScore };
  };

  return MTFServer;
});
