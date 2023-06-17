
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var params = {
            v: [rand.randIntNonZero(-4, 4), rand.randIntNonZero(-4, 4)],
            omega: rand.randSign() * rand.randInt(2, 5)
        };

        var v = $V(params.v);
        var omega = params.omega;
        var r = PrairieGeom.perp(v).x(-1 / omega);

        var trueAnswer = {
            r: r.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {r: [submittedAnswer.ri, submittedAnswer.rj]};
    };

    return server;
});
