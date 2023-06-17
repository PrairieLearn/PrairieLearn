define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var a;
        do {
            a = $V(rand.randArrayIntNonZero(2, -4, 4));
        } while (Math.abs(Math.abs(a.e(1)) - Math.abs(a.e(2))) < 1e-6
                 || Math.abs(a.e(1)) < 1e-6
                 || Math.abs(a.e(2)) < 1e-6
                 || a.modulus() < 1.5);
        var params = {
            a: a.elements,
            thetaCoeff: [rand.randInt(2,7), 9],
            thetaSign: rand.randSign(),
            bLength: rand.randInt(2, 4)
        };

        var theta = params.thetaSign * params.thetaCoeff[0] / params.thetaCoeff[1] * Math.PI;
        var bAngle = PrairieGeom.angleOf(a) + theta;
        var b = PrairieGeom.vector2DAtAngle(bAngle).x(params.bLength);

        var trueAnswer = {
            b: b.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {b: [submittedAnswer.bX, submittedAnswer.bY]};
    };

    return server;
});
