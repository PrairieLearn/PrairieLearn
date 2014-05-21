
define(["PrairieRandom", "PrairieGeom", "renderer"], function(PrairieRandom, PrairieGeom, renderer) {

    function getData(vid) {
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
        var nTrue = 1;
        var nFalse = 4;
        var answers = [], checks = [];
        answers = answers.concat(rand.randNElem(nTrue, trueAnswers));
        checks = checks.concat(rand.repeat(nTrue, true));
        answers = answers.concat(rand.randNElem(nFalse, falseAnswers));
        checks = checks.concat(rand.repeat(nFalse, false));
        rand.shuffle(answers, checks);
        var data = {
            answersHTML: renderer.answerList("radio", answers),
            checks: checks
        };
        return data;
    }

    var server = {};

    server.getParams = function(vid) {
        var params = getData(vid);
        delete params.checks;
        return params;
    };

    server.gradeAnswer = function(submittedAnswer, params, vid) {
        var data = getData(vid);
        var submittedChecks = renderer.answersToChecks("radio", data.checks.length, submittedAnswer);
        var score = PrairieGeom.hammingScore(data.checks, submittedChecks);
        return {score: score};
    };

    return server;
});
