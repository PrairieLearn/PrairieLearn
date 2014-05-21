
define(["PrairieRandom"], function(PrairieRandom) {

    var server = {};

    server.getParams = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var params = {
            a: rand.randInt(5, 10),
            b: rand.randInt(5, 10)
        };
        return params;
    };

    server.gradeAnswer = function(submittedAnswer, params) {
        var cTrue = params.a + params.b;
        var trueAnswer = {c: cTrue};

        var cSubmitted = Number(submittedAnswer.c);

        var score = 0;
        if (cTrue === cSubmitted) {
            score = 1;
        }
        return {score: score, trueAnswer: trueAnswer};
    };

    return server;
});
