define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var thetaDeg = (rand.randInt(4, 7) * 10 + rand.randElem([0, 90])) * rand.randSign();
        var params = {
            thetaDeg: thetaDeg,
            thetaDegAbs: Math.abs(thetaDeg),
            r: [rand.randIntNonZero(-3, 3), rand.randIntNonZero(-3, 3)]
        };

        var theta = PrairieGeom.degToRad(params.thetaDeg);
        var r = $V(params.r);
        var u = PrairieGeom.vector2DAtAngle(theta);
        var v = PrairieGeom.perp(u);
        var rUV = $V([r.dot(u), r.dot(v)]);

        var trueAnswer = {
            rUV: rUV.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {rUV: [submittedAnswer.rU, submittedAnswer.rV]};
    };

    return server;
});
