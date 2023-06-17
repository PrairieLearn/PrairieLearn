
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;
    var $M = Sylvester.Matrix.create;

    function solve(params) {
        var rAD = $V(params.rAD);
        var rBC = $V(params.rBC);
        var rDC = $V(params.rDC);

        var fullM = $M([[rAD.e(1)], [rAD.e(2)]]);
        fullM = fullM.augment(rBC.x(-1).elements);
        fullM = fullM.augment(rDC.elements);

        var indexes = [0, 1, 2];
        indexes.splice(params.givenIndex, 1);
        var els = [[], []];
        for (var i = 0; i < 2; i++)
            for (var j = 0; j < 2; j++)
                els[i].push(fullM.e(i + 1, indexes[j] + 1));
        var LHS = $M(els);
        var RHS = $V([-fullM.e(1, params.givenIndex + 1) * params.givenValue,
                      -fullM.e(2, params.givenIndex + 1) * params.givenValue]);

        var det = LHS.determinant();
        if (Math.abs(det) < 1e-5)
            return undefined;
        var invLHS = $M([[LHS.e(2,2), -LHS.e(1,2)], [-LHS.e(2,1), LHS.e(1,1)]]).x(1 / det);
        var solution = invLHS.x(RHS);
        var omega = (indexes[0] === params.findIndex) ? solution.e(1) : solution.e(2);
        return omega;
    }

    var server = new QServer();

    server.getData = function(vid, options) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        /* Simple cases:

           if the linkage is a rectangle (all angles 90 deg), then
           omega_3 = 0 and omega_1 = omega_2.

           if the top bar of the linkage is horizontal then omega_1 =
           omega_2.
        */

        do {
            var rAB = [rand.randInt(1, 2), 0];
            var rAD = [rand.randInt(-1, 0), rand.randInt(1, 2)];
            var rBC = [rand.randInt(0, 1), rand.randInt(1, 2)];

            if (options && options.level === "easier") {
                // top bar must be horizontal
                rBC[1] = rAD[1];

                var type = rand.randElem(["symm", "rect", "existing"]);
                if (type === "symm")
                    rBC[0] = -rAD[0];
                if (type === "rect") {
                    rAD[0] = 0;
                    rBC[0] = 0;
                }
            } else if (options && options.level === "harder") {
                // top bar must not be horiztonal
                rBC[1] = 3 - rAD[1];
            }

            var rDC = $V(rAD).x(-1).add($V(rAB)).add($V(rBC)).elements;
            var omegas = ["\\omega_1", "\\omega_2", "\\omega_3"];
            var selectedIndexes = rand.randNElem(2, [0, 1, 2]);

            if (options && options.level === "easier") {
                // if not a rectangular linkage, don't ask/give omega_3
                if (rAD[0] !== 0 || rBC[0] !== 0)
                    selectedIndexes = rand.randNElem(2, [0, 1]);
            }            

            var givenIndex = selectedIndexes[0];
            var findIndex = selectedIndexes[1];
            var givenValue = rand.randIntNonZero(-3, 3);
            omegas[givenIndex] = givenValue;
            var params = {
                rAB: rAB,
                rAD: rAD,
                rBC: rBC,
                rDC: rDC,
                omega1: omegas[0],
                omega2: omegas[1],
                omega3: omegas[2],
                givenIndex: givenIndex,
                findIndex: findIndex,
                givenValue: givenValue,
                answerExp: "\\omega_" + (findIndex + 1),
				matlabParams: ""
            }
            params.matlabParams += "rAB = [" + rAB.toString() + "]\n";
			params.matlabParams += "rAD = [" + rAD.toString() + "]\n";
			params.matlabParams += "rBC = [" + rBC.toString() + "]\n";
			params.matlabParams += "rDC = [" + rDC.toString() + "]\n";
			params.matlabParams += "omega" + (givenIndex+1).toString() + " = " + givenValue.toString();
            var omega = solve(params);
        } while (omega === undefined);
        var trueAnswer = {
            omega: omega,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
