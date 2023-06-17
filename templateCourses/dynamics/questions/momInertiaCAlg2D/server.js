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
        } while (p2[2] === p1[2] && p2[1] === p1[1]);
        p1 = PrairieGeom.prodPoly([-1], p1);

        var params = {
            rho: rand.randInt(2, 7),
            x1: x1,
            x2: x2,
            p1: p1,
            p2: p2,
        };

        var rho = params.rho;

        var xp1 = PrairieGeom.prodPoly([0, 1], p1);
        var xp2 = PrairieGeom.prodPoly([0, 1], p2);
        var x2p1 = PrairieGeom.prodPoly([0, 0, 1], p1);
        var x2p2 = PrairieGeom.prodPoly([0, 0, 1], p2);
        var hp1sq = PrairieGeom.prodPoly([0.5], PrairieGeom.prodPoly(p1, p1));
        var hp2sq = PrairieGeom.prodPoly([0.5], PrairieGeom.prodPoly(p2, p2));
        var tp1cu = PrairieGeom.prodPoly([1/3], PrairieGeom.prodPoly(p1, PrairieGeom.prodPoly(p1, p1)));
        var tp2cu = PrairieGeom.prodPoly([1/3], PrairieGeom.prodPoly(p2, PrairieGeom.prodPoly(p2, p2)));

        var p1Int = PrairieGeom.intPoly(p1);
        var p2Int = PrairieGeom.intPoly(p2);
        var xp1Int = PrairieGeom.intPoly(xp1);
        var xp2Int = PrairieGeom.intPoly(xp2);
        var x2p1Int = PrairieGeom.intPoly(x2p1);
        var x2p2Int = PrairieGeom.intPoly(x2p2);
        var hp1sqInt = PrairieGeom.intPoly(hp1sq);
        var hp2sqInt = PrairieGeom.intPoly(hp2sq);
        var tp1cuInt = PrairieGeom.intPoly(tp1cu);
        var tp2cuInt = PrairieGeom.intPoly(tp2cu);

        var p1IntDef = PrairieGeom.evalPoly(p1Int, x2) - PrairieGeom.evalPoly(p1Int, x1);
        var p2IntDef = PrairieGeom.evalPoly(p2Int, x2) - PrairieGeom.evalPoly(p2Int, x1);
        var xp1IntDef = PrairieGeom.evalPoly(xp1Int, x2) - PrairieGeom.evalPoly(xp1Int, x1);
        var xp2IntDef = PrairieGeom.evalPoly(xp2Int, x2) - PrairieGeom.evalPoly(xp2Int, x1);
        var x2p1IntDef = PrairieGeom.evalPoly(x2p1Int, x2) - PrairieGeom.evalPoly(x2p1Int, x1);
        var x2p2IntDef = PrairieGeom.evalPoly(x2p2Int, x2) - PrairieGeom.evalPoly(x2p2Int, x1);
        var hp1sqIntDef = PrairieGeom.evalPoly(hp1sqInt, x2) - PrairieGeom.evalPoly(hp1sqInt, x1);
        var hp2sqIntDef = PrairieGeom.evalPoly(hp2sqInt, x2) - PrairieGeom.evalPoly(hp2sqInt, x1);
        var tp1cuIntDef = PrairieGeom.evalPoly(tp1cuInt, x2) - PrairieGeom.evalPoly(tp1cuInt, x1);
        var tp2cuIntDef = PrairieGeom.evalPoly(tp2cuInt, x2) - PrairieGeom.evalPoly(tp2cuInt, x1);

        var m = rho * (p2IntDef - p1IntDef);

        var Cx = rho * (xp2IntDef - xp1IntDef) / m;
        var Cy = rho * (hp2sqIntDef - hp1sqIntDef) / m;
        var C = $V([Cx, Cy]);

        var IO = rho * (x2p2IntDef - x2p1IntDef + tp2cuIntDef - tp1cuIntDef);
        var IC = IO - m * Math.pow(C.modulus(), 2);

        var trueAnswer = {
            IC: IC,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
