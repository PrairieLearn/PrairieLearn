
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

            var vPoly = PrairieGeom.diffPolyArray(params.rPoly);
            var aPoly = PrairieGeom.diffPolyArray(vPoly);
            var v = $V(PrairieGeom.evalPolyArray(vPoly, params.t));
            var a = $V(PrairieGeom.evalPolyArray(aPoly, params.t));
            var vMod = v.modulus();
            var en;
            if (vMod < 1e-3) {
                en = null;
                continue;
            }
            var an = PrairieGeom.orthComp(a, v);
            if (an.modulus() < 1e-3) {
                en = null;
                continue;
            }
            en = an.toUnitVector();
        } while (en === null);
        var trueAnswer = {
            en: en.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {en: [submittedAnswer.eni, submittedAnswer.enj]};
    };

    return server;
});
