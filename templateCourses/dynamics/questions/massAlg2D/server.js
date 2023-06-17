define(["QServer", "sylvester", "PrairieRandom", "PrairieGeom"], function(QServer, Sylvester, PrairieRandom, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var x1 = rand.randInt(-2, 1);
        var x2 = rand.randInt(x1 + 1, 2);

        var randPoly = function() {
            var b = rand.randInt(-2, 2);
            var a = rand.randIntNonZero(-2, 2);
            var c;
            if (a > 0) {
                c = rand.randInt(1, 3);
            } else {
                var cMax = Math.max(1 - a * Math.pow(x1 - b, 2), 1 - a * Math.pow(x2 - b, 2));
                c = rand.randInt(cMax, cMax + 2);
            }
            return [a * b * b + c, - 2 * a * b, a];
        };

        var p1 = randPoly();
        do {
            var p2 = randPoly();
        } while ((p2[0] === p1[0] && p2[1] === p1[1]) || (p2[0] === -p1[0] && p2[1] === -p1[1]));
        p1 = PrairieGeom.prodPoly([-1], p1);

        var params = {
            rho: rand.randInt(2, 9),
            x1: x1,
            x2: x2,
            p1: p1,
            p2: p2,
        };

        var rho = params.rho;

        var p1Int = PrairieGeom.intPoly(p1);
        var p2Int = PrairieGeom.intPoly(p2);

        var p1IntDef = PrairieGeom.evalPoly(p1Int, x2) - PrairieGeom.evalPoly(p1Int, x1);
        var p2IntDef = PrairieGeom.evalPoly(p2Int, x2) - PrairieGeom.evalPoly(p2Int, x1);

        var m = rho * (p2IntDef - p1IntDef);

        var trueAnswer = {
            m: m,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
