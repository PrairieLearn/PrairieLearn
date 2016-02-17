
define(["underscore", "QServer", "PrairieRandom"], function(_, QServer, PrairieRandom) {

    function MTFServer() {
        QServer.call(this);
    }
    MTFServer.prototype = new QServer();

    MTFServer.prototype.getData = function(vid, options) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        // Set some default values first.
        // Missing values should be caught by the schemas.
        options = _.defaults(options, {
            text: "",
            trueStatements: [],
            falseStatements: [],
            correctScore: 1,
            incorrectScore: 0,
            guessingPenalty: 0
        });

        var numberTrue = options.trueStatements.length;
        var numberFalse = options.falseStatements.length;

        // TODO(tnip): This is kinda weird. We should be checking for
        // definedness on the full set. If empty, throw an error.
        //
        // Here, we want a list of all the statements so we can list them all.
        var allStatements = [];
        allStatements = allStatements.concat(options.trueStatements);
        allStatements = allStatements.concat(options.falseStatements);

        allStatements = _(allStatements).map(function(value, index) {
              return {key: 'q' + index.toString(), statement: value};
        });
        var perm = rand.shuffle(allStatements);

        var trueAnswer = [];

        // For every index we have, if it's less than the length of true list,
        // we deem it a true statement. Else, it's false.
        for(var i = 0; i < perm.length; i++) {
          trueAnswer.push(i < options.trueStatements.length);
        }

        var params = {
            statements: allStatements,
            text: options.text
        };

        var questionData = {
            params: params,
            trueAnswer: { 'correctAnswers' : trueAnswer }
        };

        return questionData;
    }

    MTFServer.prototype.gradeAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        trueAnswer = trueAnswer.correctAnswers;
        var finalScore = 0.0;
        var maxScore = options.correctScore * trueAnswer.length;

        // Assumptions:
        //  trueAnswer[i]: T, submittedAnswer[qi-true]: T -> Correct
        //  trueAnswer[i]: F, submittedAnswer[qi-false]: T -> Correct
        //  Else: Incorrect
        console.log(trueAnswer);
        console.log(submittedAnswer);

        for (var i = 0; i < trueAnswer.length; i++) {
          var questionId = 'q' + i.toString();

          console.log(i.toString(), trueAnswer, submittedAnswer[questionId + '-true'], submittedAnswer[questionId + '-false'])
          if ((trueAnswer[i] && submittedAnswer[questionId + '-true']) ||
             (!trueAnswer[i] && submittedAnswer[questionId + '-false'])) {
            console.log('fds');
            finalScore += options.correctScore;
          } else if (submittedAnswer[questionId + '-true'] || submittedAnswer[questionId + '-false']) {
            finalScore = finalScore + (options.incorrectScore + options.guessingPenalty);
          } else {
            finalScore += options.incorrectScore;
          }
        }

        // We floor the questions's final score to 0.
        finalScore = Math.max(finalScore / maxScore, 0.0);
        return { 'score' : finalScore };
    }

    return MTFServer;
});
