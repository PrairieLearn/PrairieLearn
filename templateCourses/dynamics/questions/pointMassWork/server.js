
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var r0, rf;
        do {
            r0 = $V([rand.randIntNonZero(-9, 9), rand.randIntNonZero(-9, 9)]);
            rf = $V([rand.randIntNonZero(-9, 9), rand.randIntNonZero(-9, 9)]);
        } while (r0.subtract(rf).modulus() < 4);
        var F = $V([rand.randIntNonZero(-9, 9), rand.randIntNonZero(-9, 9)]);
        var params = {
            m: rand.randInt(2, 9),
            F: F.elements,
            r0: r0.elements,
            rf: rf.elements,
            tf: rand.randInt(3, 7),
        };

        var W = F.dot(rf.subtract(r0));
        var trueAnswer = {
            W: W,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
