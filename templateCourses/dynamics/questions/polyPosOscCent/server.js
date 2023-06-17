
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        do {
            var params = {
                rPoly: [rand.randPoly(rand.randInt(1,2)), rand.randPoly(rand.randInt(1,2))],
                t: rand.randInt(1, 3)
            };
            var C;
            var vPoly = PrairieGeom.diffPolyArray(params.rPoly);
            var aPoly = PrairieGeom.diffPolyArray(vPoly);
            var r = $V(PrairieGeom.evalPolyArray(params.rPoly, params.t));
            var v = $V(PrairieGeom.evalPolyArray(vPoly, params.t));
            var a = $V(PrairieGeom.evalPolyArray(aPoly, params.t));
            var vMod = v.modulus();
            if (vMod < 1e-3) {
                C = null;
                continue;
            }
            var an = PrairieGeom.orthComp(a, v);
            var anMod = an.modulus();
            if (anMod < 1e-3) {
                C = null;
                continue;
            }
            var en = an.toUnitVector();
            var rho = Math.pow(vMod, 2) / anMod;
            C = r.add(en.x(rho));
        } while (C === null);
        var trueAnswer = {
            x: C.e(1),
            y: C.e(2),
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
