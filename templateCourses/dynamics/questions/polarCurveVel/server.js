define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "PrairieTemplate"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, PrairieTemplate) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        // C + A sin(B theta + D)
        var curveC = rand.randInt(3, 4);
        var curveA = rand.randIntNonZero(-2, 2);
        var curveB = rand.randSign() * rand.randInt(3, 5);
        var curveD = rand.randInt(1, 5);
        var curveF = rand.randElem(["sin", "cos"]);

        var curveExpn = curveC + " " + ((curveA > 0) ? "+" : "-")
            + " " + PrairieTemplate.scalarCoeff(Math.abs(curveA)) + "\\" + curveF + "("
            + PrairieTemplate.scalarCoeff(curveB) + "\\theta" + " " + ((curveD > 0) ? "+" : "-")
            + " " + Math.abs(curveD) + ")";

        var params = {
            curveC: curveC,
            curveA: curveA,
            curveB: curveB,
            curveD: curveD,
            curveF: curveF,
            curveExpn: curveExpn,
            theta: rand.randIntNonZero(-4, 4),
            omega: rand.randIntNonZero(-5, 5)
        };

        var theta = params.theta;
        var omega = params.omega;
        var alpha = params.alpha;

        var f = ((curveF === "sin") ? Math.sin : Math.cos);
        var fDot = ((curveF === "sin") ? Math.cos : (function(x) {return -Math.sin(x);}));

        var r = curveC + curveA * f(curveB * theta + curveD);
        var rDot = curveA * fDot(curveB * theta + curveD) * curveB * omega;

        var vR = rDot;
        var vTheta = r * omega;

        var polarBasis = PrairieGeom.polarBasis($V([r, theta]));
        var eR = polarBasis[0];
        var eTheta = polarBasis[1];
        var v = eR.x(vR).add(eTheta.x(vTheta));

        var trueAnswer = {
            v: v.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {v: [submittedAnswer.vi, submittedAnswer.vj]};
    };

    return server;
});
