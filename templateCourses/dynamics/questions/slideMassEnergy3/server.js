
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "underscore"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, _) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        // sufficient conditions for solutions to always exist with correct signs:
        // h > Math.abs(vf * vf - v0 * v0) / (2 * g)

        var params = {
            m: rand.randInt(2, 9),
            h: rand.randInt(5, 19),
            v0: rand.randInt(2, 9),
            vf: rand.randInt(2, 9),
            orient: rand.randSign(),
        };

        var g = 9.8;
        var W = params.m * (0.5 * params.vf * params.vf - 0.5 * params.v0 * params.v0 - g * params.h);
        var trueAnswer = {
            W: W,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
