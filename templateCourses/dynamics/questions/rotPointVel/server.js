
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var params = {
            r: rand.randArrayIntNonZero(2, -4, 4),
            omega: rand.randIntNonZero(-3, 3)
        };

        var r = $V(params.r);
        var v = PrairieGeom.cross2D(params.omega, r);

        var trueAnswer = {
            v: v.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {v: [submittedAnswer.vi, submittedAnswer.vj]};
    };

    return server;
});
