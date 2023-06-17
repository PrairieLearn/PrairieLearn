
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "underscore"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, _) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var omega1 = rand.randIntNonZero(-3, 3);
        var omega2 = rand.randIntNonZero(-3, 3);
        var alpha1 = rand.randIntNonZero(-3, 3);
        var alpha2 = rand.randIntNonZero(-3, 3);

        var rOP, rPQ, angle;
        do {
            rOP = $V([rand.randInt(-2, 2), rand.randInt(1, 3)]);
            rPQ = $V(rand.randArrayIntNonZero(2, -2, 2));
            angle = rOP.angleFrom(rPQ);
        } while (angle < 0.1 || Math.abs(angle - 0.5 * Math.PI) < 0.1 || angle > 0.8 * Math.PI);

        // we ensure that any two of {rOP, rPQ, rOP.perp, rPQ.perp} are linearly independent

        var params = {
            rOP: rOP.elements,
            rPQ: rPQ.elements,
            omega1: omega1,
            omega2: omega2,
            alpha1: alpha1,
            alpha2: alpha2,
        };

        var aQ = PrairieGeom.cross2D(alpha1, rOP).add(
            PrairieGeom.cross2D(omega1, PrairieGeom.cross2D(omega1, rOP))).add(
                PrairieGeom.cross2D(alpha2, rPQ)).add(
                    PrairieGeom.cross2D(omega2, PrairieGeom.cross2D(omega2, rPQ)));

        var trueAnswer = {
            aQ: aQ.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {aQ: [submittedAnswer.aQi, submittedAnswer.aQj]};
    };

    return server;
});
