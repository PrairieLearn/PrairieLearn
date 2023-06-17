define(["QServer", "sylvester", "PrairieRandom", "PrairieGeom"], function(QServer, Sylvester, PrairieRandom, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        do {
            var mass = rand.randInt(3, 9);
            var params = {
                mass: mass,
                trigFcn: rand.randElem(["sin", "cos"]),
                trigCoeff: rand.randSign() * rand.randInt(1, 4),
                trigFreq: rand.randInt(3, 6) / 2,
                x: rand.randInt(2, 12),
                Fw: rand.randArrayIntNonZero(2, -20 * mass, 20 * mass),
            };
            var trig = {
                fcn: params.trigFcn,
                coeff: params.trigCoeff,
                freq: params.trigFreq,
            };
            var x = params.x;
            var dTrig = PrairieGeom.diffTrig(trig);
            var d2Trig = PrairieGeom.diffTrig(dTrig);
            var dyDX = PrairieGeom.evalTrig(dTrig, x);
            var d2yD2X = PrairieGeom.evalTrig(d2Trig, x);
            var et = $V([1, dyDX]).toUnitVector();
            var en = PrairieGeom.perp(et).x(PrairieGeom.sign(d2yD2X));
            var g = 9.8;
            var Fg = $V([0, -params.mass * g]);
            var a = $V(params.Fw).add(Fg).x(1 / params.mass);
            var an = a.dot(en);
        } while (Math.abs(d2yD2X) < 0.1 || an < 1);

        var mass = params.mass;
        var trig = {
            fcn: params.trigFcn,
            coeff: params.trigCoeff,
            freq: params.trigFreq,
        };
        var x = params.x;
        var Fw = $V(params.Fw);

        var g = 9.8;
        var Fg = $V([0, -mass * g]);

        var a = Fw.add(Fg).x(1 / mass);

        var trueAnswer = {
            a: a.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {a: [submittedAnswer.ai, submittedAnswer.aj]};
    };

    return server;
});
