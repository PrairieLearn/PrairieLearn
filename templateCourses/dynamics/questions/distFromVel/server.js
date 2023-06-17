
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var params = {
            vPoly: [rand.randPoly(2, 3), rand.randPoly(2, 3)],
            t: rand.randInt(1, 3)
        };

        var rPoly = PrairieGeom.intPolyArray(params.vPoly);
        var rVec = $V(PrairieGeom.evalPolyArray(rPoly, params.t));
        var r = rVec.modulus();

        var trueAnswer = {
            r: r,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
