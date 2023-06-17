
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "underscore"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, _) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var rOP, rPQ, angle;
        do {
            rOP = $V([rand.randInt(-2, 2), rand.randInt(1, 3)]);
            rPQ = $V(rand.randArrayIntNonZero(2, -2, 2));
            angle = rOP.angleFrom(rPQ);
        } while (angle < 0.1 || Math.abs(angle - 0.5 * Math.PI) < 0.1 || angle > 0.8 * Math.PI);

        var m1, m2;
        do {
            m1 = rand.randInt(2, 9);
            m2 = rand.randInt(2, 9);
        } while (m1 === m2);

        var params = {
            m1: m1,
            m2: m2,
            rOP: rOP.elements,
            rPQ: rPQ.elements,
        };

        var rOC1 = rOP.x(0.5);
        var rOC2 = rOP.add(rPQ.x(0.5));

        var g = 9.8;
        var V1 = m1 * g * rOC1.e(2);
        var V2 = m2 * g * rOC2.e(2);
        var V = V1 + V2;
        var trueAnswer = {
            V: V,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
