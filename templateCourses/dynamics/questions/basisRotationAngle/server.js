define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var theta = (rand.randInt(0, 3) / 2 + rand.randReal(0.1, 0.4)) * Math.PI;
        var u = PrairieGeom.vector2DAtAngle(theta);
        var v = PrairieGeom.perp(u);

        var r = PrairieGeom.polarToRect($V([rand.randReal(3, 6), rand.randReal(0, 2 * Math.PI)]));
        var rUV = $V([r.dot(u), r.dot(v)]);

        var params = {
            r: r.elements,
            rUV: rUV.elements,
        };

        /*
          Can also compute the answer as:
          theta = atan2(rY, rX) - atan2(rV, rU)
          (up to a multiple of 2 pi)
         */

        var trueAnswer = {
            theta: theta,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
