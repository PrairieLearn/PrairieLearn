define(["QServer", "sylvester", "PrairieRandom", "PrairieGeom"], function(QServer, Sylvester, PrairieRandom, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        do {
            var params = {
                mass: rand.randInt(3, 9),
                trigFcn: rand.randElem(["sin", "cos"]),
                trigCoeff: rand.randSign() * rand.randInt(1, 4),
                trigFreq: rand.randInt(3, 6) / 2,
                x: rand.randInt(2, 12),
                v: rand.randInt(1, 4),
                dir: rand.randElem([1, -1]),
                sDDotDir: rand.randElem([1, -1]),
                sDDotMag: rand.randInt(1, 5),
				matlabParams: ""
            };
			params.matlabParams += "m = " + params.mass.toString() + "\n";
			params.matlabParams += "g = -9.8\n";
			params.matlabParams += "x = " + params.x.toString() + "\n";
			params. matlabParams += "v = " + params.v.toString() + "\n";
			params.matlabParams += "vDot = " + (params.sDDotDir > 0 ? "" : "-") + params.sDDotMag.toString();
            var trig = {
                fcn: params.trigFcn,
                coeff: params.trigCoeff,
                freq: params.trigFreq,
            };
            var x = params.x;
            var dTrig = PrairieGeom.diffTrig(trig);
            var d2Trig = PrairieGeom.diffTrig(dTrig);
            var d2yD2X = PrairieGeom.evalTrig(d2Trig, x);
        } while (Math.abs(d2yD2X) < 0.1);

        var mass = params.mass;
        var trig = {
            fcn: params.trigFcn,
            coeff: params.trigCoeff,
            freq: params.trigFreq,
        };
        var x = params.x;
        var v = params.v;
        var dir = params.dir;
        var sDDot = params.sDDotDir * params.sDDotMag;

        var dTrig = PrairieGeom.diffTrig(trig);
        var d2Trig = PrairieGeom.diffTrig(dTrig);
        var dyDX = PrairieGeom.evalTrig(dTrig, x);
        var d2yD2X = PrairieGeom.evalTrig(d2Trig, x);

        var et = $V([1, dyDX]).toUnitVector();
        var en = PrairieGeom.perp(et).x(PrairieGeom.sign(d2yD2X));
        et = et.x(dir);

        var kappa = Math.abs(d2yD2X) / Math.pow(1 + Math.pow(dyDX, 2), 3/2);
        var a = et.x(sDDot).add(en.x(v * v * kappa));

        var g = 9.8;
        var Fg = $V([0, -mass * g]);

        // m a = Fg + F
        var F = a.x(mass).subtract(Fg);

        var trueAnswer = {
            F: F.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {F: [submittedAnswer.FI, submittedAnswer.FJ]};
    };

    return server;
});
