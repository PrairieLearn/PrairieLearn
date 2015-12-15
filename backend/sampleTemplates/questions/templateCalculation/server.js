
define(["PrairieRandom", "PrairieGeom"], function(PrairieRandom, PrairieGeom) {

    var server = {};

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var a = rand.randInt(5, 10);
        var b = rand.randInt(5, 10);
        var c = a + b;
        var params = {
            a: a,
            b: b,
        };
        var trueAnswer = {
            c: c,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.gradeAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        var score = 0, feedback = {};
        if (PrairieGeom.checkEqual(trueAnswer, submittedAnswer, 1e-2, 1e-8))
            score = 1;
        else
            feedback.ansRelation = "Your answer was too " + ((submittedAnswer.c < trueAnswer.c) ? "low" : "high") + ".";
        return {score: score, feedback: feedback};
    };

    return server;
});
