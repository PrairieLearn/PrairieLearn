
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        do {
            var r = $V(rand.randArrayIntNonZero(3, -5, 5));
            var u = $V(rand.randArrayIntNonZero(3, -5, 5));
            var v = rand.randIntNonZero(2, 10);
            var params = {
                x: r.e(1),
                y: r.e(2),
                z: r.e(3),
                u: u.elements,
                v: v,
            };
        } while (u.cross(r).modulus() < 1);

        var omegaHat = u.toUnitVector();
        var omega = v / omegaHat.cross(r).modulus();

        var trueAnswer = {
            omega: omega,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
