
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "PrairieTemplate"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, PrairieTemplate) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var x0, y0, t, vExp, tInSeconds, x, y, vr, vh, p0Polar, r0, h0, r, h, p;

        switch (rand.randInt(1, 3)) {
        case 1:
            // position
            x0 = rand.randSign() * rand.randInt(10, 15);
            y0 = rand.randSign() * rand.randInt(10, 15);
            p0Polar = PrairieGeom.rectToPolar($V([x0, y0]));
            r0 = p0Polar.e(1);
            h0 = p0Polar.e(2);
            // velocity
            vr = rand.randIntNonZero(-3, 3);
            vh = rand.randIntNonZero(-3, 3);
            vExp = PrairieTemplate.vectorString([vr, vh], "\\hat{e}_r", "\\hat{e}_{\\theta}");
            tInSeconds = false;
            // final time
            t = rand.randInt(2, 3);
            // final position
            r = vr * t + r0;
            h = (vh / vr) * (Math.log(r) - Math.log(r0)) + h0;
            p = PrairieGeom.polarToRect($V([r, h]));
            x = p.e(1);
            y = p.e(2);
            break;
        case 2:
            // position
            x0 = rand.randSign() * rand.randInt(2, 5);
            y0 = rand.randSign() * rand.randInt(2, 5);
            p0Polar = PrairieGeom.rectToPolar($V([x0, y0]));
            r0 = p0Polar.e(1);
            h0 = p0Polar.e(2);
            // velocity
            vhFcn = rand.randFunc();
            vExp = PrairieTemplate.parenFcnString(vhFcn, "t") + "\\,\\hat{e}_{\\theta}";
            tInSeconds = true;
            // final time
            t = rand.randInt(2, 5);
            // final position
            r = r0;
            vhInt = PrairieGeom.intFcn(vhFcn);
            h = (1 / r0) * (PrairieGeom.evalFcn(vhInt, t) - PrairieGeom.evalFcn(vhInt, 0)) + h0;
            p = PrairieGeom.polarToRect($V([r, h]));
            x = p.e(1);
            y = p.e(2);
            break;
        case 3:
            // position
            x0 = rand.randSign() * rand.randInt(6, 12);
            y0 = rand.randSign() * rand.randInt(6, 12);
            p0Polar = PrairieGeom.rectToPolar($V([x0, y0]));
            r0 = p0Polar.e(1);
            h0 = p0Polar.e(2);
            // velocity
            vrFcn = {fcn: "trig", data: rand.randTrig()};
            vExp = PrairieTemplate.parenFcnString(vrFcn, "t") + "\\,\\hat{e}_r";
            tInSeconds = true;
            // final time
            t = rand.randInt(2, 5);
            // final position
            vrInt = PrairieGeom.intFcn(vrFcn);
            r = PrairieGeom.evalFcn(vrInt, t) - PrairieGeom.evalFcn(vrInt, 0) + r0;
            h = h0;
            p = PrairieGeom.polarToRect($V([r, h]));
            x = p.e(1);
            y = p.e(2);
            break;
        }

        var params = {
            x0: x0,
            y0: y0,
            t: t,
            vExp: vExp,
            tInSeconds: tInSeconds,
        };
        var trueAnswer = {
            x: x,
            y: y
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformTrueAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {P: [trueAnswer.x, trueAnswer.y]};
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {P: [submittedAnswer.x, submittedAnswer.y]};
    };

    return server;
});
