define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "PrairieTemplate"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, PrairieTemplate) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        do {
            // C + A sin(B theta + D)
            var curveC = rand.randInt(3, 4);
            var curveA = rand.randIntNonZero(-2, 2);
            var curveB = rand.randSign() * rand.randInt(3, 5);
            var curveD = rand.randInt(1, 5);
            var curveF = rand.randElem(["sin", "cos"]);

            var theta = rand.randIntNonZero(-4, 4);
            var omega = rand.randIntNonZero(-2, 2);
            var alpha = rand.randIntNonZero(-3, 3);

            var f = ((curveF === "sin") ? Math.sin : Math.cos);
            var fDot = ((curveF === "sin") ? Math.cos : (function(x) {return -Math.sin(x);}));

            var r = curveC + curveA * f(curveB * theta + curveD);
            var rDot = curveA * fDot(curveB * theta + curveD) * curveB * omega;
            var rDDot = -curveA * f(curveB * theta + curveD) * Math.pow(curveB * omega, 2)
                + curveA * fDot(curveB * theta + curveD) * curveB * alpha;
        } while (Math.abs(rDot) < 1e-3 || Math.abs(rDDot) < 1e-3);

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
            theta: theta,
            omega: omega,
            alpha: alpha,
        };

        var radial;
        if (rDot < 0 && rDDot < 0) {
            radial = "towardsIncreasing";
        } else if (rDot < 0 && rDDot > 0) {
            radial = "towardsDecreasing";
        } else if (rDot > 0 && rDDot < 0) {
            radial = "awayDecreasing";
        } else if (rDot > 0 && rDDot > 0) {
            radial = "awayIncreasing";
        }

        var trueAnswer = {
            radial: radial,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
