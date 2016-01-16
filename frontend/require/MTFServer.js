
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
            trueStatements: [],
            falseStatements: []
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
          trueAnswer.push(perm[i] < options.trueStatements.length);
        }

        var params = {
            statements: allStatements
        };

        var questionData = {
            params: params,
            trueAnswer: trueAnswer
        };

        return questionData;
    }

    MTFServer.prototype.gradeAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        var finalScore = 0.0;
        var numberCorrect = 0.0;

        // Assumptions:
        //  trueAnswer[i]: T, submittedAnswer[qi-true]: T -> Correct
        //  trueAnswer[i]: F, submittedAnswer[qi-false]: T -> Correct
        //  Else: Incorrect
        for (var i = 0; i < trueAnswer.length; i++) {
          var questionId = 'q' + i.toString();

          if ((trueAnswer[i] && submittedAnswer[questionId + '-true']) ||
            (!trueAnswer[i] && submittedAnswer[questionId + '-false'])) {
            numberCorrect++;
          }
        }

        finalScore = numberCorrect / (trueAnswer.length * 1.0);

        return { 'score' : finalScore };
    }

    return MTFServer;
});
