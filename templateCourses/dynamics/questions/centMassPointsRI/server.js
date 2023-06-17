
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "underscore", "PrairieTemplate"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, _, PrairieTemplate) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        do {
            var masses = rand.randNElem(3, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
            var r = [
                rand.randArrayIntNonZero(2, -9, 9),
                rand.randArrayIntNonZero(2, -9, 9),
                rand.randArrayIntNonZero(2, -9, 9),
            ];
            var rC = rand.randArrayIntNonZero(2, -15, 15);
            var minDist = Math.min(
                $V(r[0]).subtract($V(r[1])).modulus(),
                $V(r[1]).subtract($V(r[2])).modulus(),
                $V(r[2]).subtract($V(r[0])).modulus(),
                $V(rC).subtract($V(r[0])).modulus(),
                $V(rC).subtract($V(r[1])).modulus(),
                $V(rC).subtract($V(r[2])).modulus()
            );
            var rExp = _(r).map(function(rr) {return PrairieTemplate.cartesianVectorString(rr) + "{\\rm\\ m}";});
            var findI = rand.randInt(1, 3);
            r[findI - 1] = null;
            rExp[findI - 1] = "\\text{unknown}";
			var matlabGiven = "";
			for (i = 1; i <= 3; i++) {
				if (i != findI) {
					matlabGiven += "r" + i.toString() + " = [" + r[i-1].toString() + "]\n";
				}
			}
            var params = {
                m1: masses[0],
                m2: masses[1],
                m3: masses[2],
                r1: r[0],
                r2: r[1],
                r3: r[2],
                r1Exp: rExp[0],
                r2Exp: rExp[1],
                r3Exp: rExp[2],
                findI: findI,
                rC: rC,
				matlabGiven: matlabGiven
            };
        } while (minDist < 2.5);

        var m1 = params.m1;
        var m2 = params.m2;
        var m3 = params.m3;
        var partial, findM;
        if (findI === 1) {
            partial = $V(params.r2).x(m2).add($V(params.r3).x(m3));
            findM = m1;
        } else if (findI === 2) {
            partial = $V(params.r3).x(m3).add($V(params.r1).x(m1));
            findM = m2;
        } else if (findI === 3) {
            partial = $V(params.r1).x(m1).add($V(params.r2).x(m2));
            findM = m3;
        }
        var r = $V(params.rC).x(m1 + m2 + m3).subtract(partial).x(1 / findM);

        var trueAnswer = {
            r: r.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {r: [submittedAnswer.ri, submittedAnswer.rj]};
    };

    return server;
});
