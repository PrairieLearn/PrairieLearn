
define(["underscore", "PrairieRandom", "PrairieGeom", "renderer"], function(_, PrairieRandom, PrairieGeom, renderer) {

    var server = {};

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var trueAnswers = [
            "Cheap",
            "High energy density",
            "Provide energy on demand",
        ];
        var falseAnswers = [
            "Non-polluting",
            "Low energy density",
            "Low production of carbon dioxide",
            "High production of carbon dioxide",
            "Secure",
            "Sustainable",
            "Low energy return",
        ];
        var nTrue = rand.randInt(1, 3);
        var nFalse = 5 - nTrue;
        var answers = [], checks = [];
        answers = answers.concat(rand.randNElem(nTrue, trueAnswers));
        checks = checks.concat(rand.repeat(nTrue, true));
        answers = answers.concat(rand.randNElem(nFalse, falseAnswers));
        checks = checks.concat(rand.repeat(nFalse, false));
        rand.shuffle(answers, checks);
        var params = {
            answersHTML: renderer.answerList("checkbox", answers),
        };
        var trueAnswer = {
            checks: checks,
            trueHTML: renderer.unorderedList(_(answers).filter(function(s, i) {return checks[i];})),
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    }

    server.gradeAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        var submittedChecks = renderer.answersToChecks("checkbox", trueAnswer.checks.length, submittedAnswer);
        var score = 0;
        if (PrairieGeom.hammingDistance(trueAnswer.checks, submittedChecks) === 0)
            score = 1;
        return {score: score};
    };

    return server;
});
