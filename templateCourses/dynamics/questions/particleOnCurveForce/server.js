define(["QServer", "sylvester", "PrairieRandom", "PrairieGeom"], function(QServer, Sylvester, PrairieRandom, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var params = {
            mass: rand.randInt(3, 9),
            trigFcn: rand.randElem(["sin", "cos"]),
            trigCoeff: rand.randSign() * rand.randInt(1, 4),
            trigFreq: rand.randInt(3, 6) / 2,
            x: rand.randInt(2, 12),
            vx: rand.randIntNonZero(-4, 4),
        };

        var mass = params.mass;
        var trig = {
            fcn: params.trigFcn,
            coeff: params.trigCoeff,
            freq: params.trigFreq,
        };
        var x = params.x;
        var vx = params.vx;

        var dTrig = PrairieGeom.diffTrig(trig);
        var d2Trig = PrairieGeom.diffTrig(dTrig);
        var dyDX = PrairieGeom.evalTrig(dTrig, x);
        var d2yD2X = PrairieGeom.evalTrig(d2Trig, x);

        // y(x(t))
        // dyDX xDot
        // d2yD2X xDot^2 + xyDX xDDot (second term is zero for us)

        var yDDot = d2yD2X * Math.pow(vx, 2);
        // m yDDot = - m g + F_w
        var g = 9.8;
        var F = $V([0, mass * (yDDot + g)]);

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
