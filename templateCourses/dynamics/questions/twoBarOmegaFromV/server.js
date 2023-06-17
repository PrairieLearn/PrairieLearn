
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "underscore"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, _) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var omega1 = rand.randIntNonZero(-3, 3);
        var omega2 = rand.randIntNonZero(-3, 3);

        var rOP, rPQ, angle;
        do {
            rOP = $V([rand.randInt(-2, 2), rand.randInt(1, 3)]);
            rPQ = $V(rand.randArrayIntNonZero(2, -2, 2));
            angle = rOP.angleFrom(rPQ);
        } while (angle < 0.1 || Math.abs(angle - 0.5 * Math.PI) < 0.1 || angle > 0.8 * Math.PI);

        // we ensure that any two of {rOP, rPQ, rOP.perp, rPQ.perp} are linearly independent

        var vQ = PrairieGeom.cross2D(omega1, rOP).add(PrairieGeom.cross2D(omega2, rPQ));

        if (rand.randBool()) {
            answerExp = "\\omega_1";
            answer = omega1;
        } else {
            answerExp = "\\omega_2";
            answer = omega2;
        }

        var params = {
            vQ: vQ.elements,
            rOP: rOP.elements,
            rPQ: rPQ.elements,
            answerExp: answerExp,
        };
        var trueAnswer = {
            answer: answer,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
