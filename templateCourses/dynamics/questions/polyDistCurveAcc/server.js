
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var params = {
            sPoly: rand.randPoly(2, undefined, undefined, false),
            t: rand.randInt(1, 3),
            rho: rand.randInt(2, 10)
        };

        var sDotPoly = PrairieGeom.diffPoly(params.sPoly);
        var sDDotPoly = PrairieGeom.diffPoly(sDotPoly);
        var sDot = PrairieGeom.evalPoly(sDotPoly, params.t);
        var sDDot = PrairieGeom.evalPoly(sDDotPoly, params.t);
        var aTN = $V([sDDot, sDot * sDot / params.rho]);
        var a = aTN.modulus();

        var trueAnswer = {
            a: a,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
