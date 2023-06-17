define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;
    var $M = Sylvester.Matrix.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var a, cDotA, cDotB;
        do {
            a = $V(rand.randArrayIntNonZero(2, -4, 4));
            cDotA = rand.randIntNonZero(-10, 10);
            cDotB = rand.randIntNonZero(-10, 10);
        } while (Math.abs(Math.abs(a.e(1)) - Math.abs(a.e(2))) < 1e-6
                 || Math.abs(a.e(1)) < 1e-6
                 || Math.abs(a.e(2)) < 1e-6
                 || a.modulus() < 1.5
                 || Math.abs(Math.abs(cDotA) - Math.abs(cDotB)) < 1e-6);
        var params = {
            a: a.elements,
            cDotA: cDotA,
            cDotB: cDotB
        };

        var b = PrairieGeom.perp(a);
        var LHS = $M([a.elements, b.elements]);
        var RHS = $V([params.cDotA, params.cDotB]);
        var c = LHS.inverse().multiply(RHS);

        var trueAnswer = {
            c: c.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {c: [submittedAnswer.cX, submittedAnswer.cY]};
    };

    return server;
});
