
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "PrairieTemplate", "underscore", "numeric"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, PrairieTemplate, _, numeric) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        for (;;) {
            var rOP = $V(rand.randElem([[1, 1], [0, 2], [-1, 1], [1, -1], [0, -2], [-1, -1]]));
            var rPQ = $V([rand.randSign() * 8, rand.randInt(-2, 2)]);

            var ei = $V([1, 0]);
            var ej = $V([0, 1]);
            var eQT = $V(rand.randElem([ei, ej]));
            var eQN = PrairieGeom.perp(eQT);
            if (eQT.e(1) === 0) {
                // rotate everything by 90 deg
                rOP = PrairieGeom.perp(rOP);
                rPQ = PrairieGeom.perp(rPQ);
            }

            var rOPPerp = PrairieGeom.perp(rOP);
            var rPQPerp = PrairieGeom.perp(rPQ);
            var rCP = rPQ.x(-0.5);
            var rCQ = rPQ.x(0.5);
            var rCPPerp = PrairieGeom.perp(rCP);
            var rCQPerp = PrairieGeom.perp(rCQ);

            var omega1, omega2, alpha1, alpha2;
            if (rOP.dot(eQT) === 0) {
                omega2 = 0;
                omega1 = rand.randIntNonZero(-3, 3);
                alpha2 = (omega1 * omega1 * rOP.dot(eQN) + omega2 * omega2 * rPQ.dot(eQN)) / rPQ.dot(eQT);
                alpha1 = rand.randIntNonZero(-2, 2);
            } else {
                omega2 = rand.randIntNonZero(-2, 2);
                omega1 = -omega2 * rPQ.dot(eQT) / rOP.dot(eQT);
                alpha2 = rand.randIntNonZero(-2, 2);
                alpha1 = (omega1 * omega1 * rOP.dot(eQN) + omega2 * omega2 * rPQ.dot(eQN) - alpha2 * rPQ.dot(eQT)) / rOP.dot(eQT);
            }

            var vP = rOPPerp.x(omega1);
            var vQ = vP.add(rPQPerp.x(omega2));

            var aP = rOPPerp.x(alpha1).add(rOP.x(-omega1 * omega1));
            var aQ = aP.add(rPQPerp.x(alpha2)).add(rPQ.x(-omega2 * omega2));

            var m1 = 2 * rand.randInt(1, 2);
            var m2 = 3 * rand.randInt(1, 2);
            var I1 = 0.5 * m2 * (rOP.e(1) * rOP.e(1) + rOP.e(2) * rOP.e(2));
            var I2 = (1/12) * m2 * (rPQ.e(1) * rPQ.e(1) + rPQ.e(2) * rPQ.e(2));

            var id2 = Sylvester.Matrix.I(2);
            var zero21 = Sylvester.Matrix.Zero(2, 1);
            var zero12 = Sylvester.Matrix.Zero(1, 2);
            var zero22 = Sylvester.Matrix.Zero(2, 2);

            var lhsBlocks = [], rhsBlocks = [];
            // variable order: alpha1, alpha2, aP, aQ, M, fP, fQ

            // -alpha1 * rOPPerp + aP = -omega1^2 * rOP
            lhsBlocks.push([rOPPerp.x(-1), zero21, id2, zero22, zero21, zero22, zero22]);
            rhsBlocks.push([rOP.x(-omega1 * omega1)]);

            // -alpha2 * rPQPerp - aP + aQ = -omega2^2 * rPQ
            lhsBlocks.push([zero21, rPQPerp.x(-1), id2.x(-1), id2, zero21, zero22, zero22]);
            rhsBlocks.push([rPQ.x(-omega2 * omega2)]);

            // -I1 * alpha1 + M - rOPPerp . fP = 0
            lhsBlocks.push([-I1, 0, zero12, zero12, 1, PrairieGeom.vecTranspose(rOPPerp.x(-1)), zero12]);
            rhsBlocks.push([0]);

            // -m2/2 * aP - m2/2 * aQ + fP + fQ = 0
            lhsBlocks.push([zero21, zero21, id2.x(-m2 / 2), id2.x(-m2 / 2), zero21, id2, id2]);
            rhsBlocks.push([zero21]);

            // -I2 * alpha2 + rCPPerp . fP + rCQPerp . fQ = 0
            lhsBlocks.push([0, -I2, zero12, zero12, 0, PrairieGeom.vecTranspose(rCPPerp), PrairieGeom.vecTranspose(rCQPerp)]);
            rhsBlocks.push([0]);

            // eQN . aQ = 0
            lhsBlocks.push([0, 0, zero12, PrairieGeom.vecTranspose(eQN), 0, zero12, zero12]);
            rhsBlocks.push([0]);

            // eQT . fQ = 0
            lhsBlocks.push([0, 0, zero12, zero12, 0, zero12, PrairieGeom.vecTranspose(eQT)]);
            rhsBlocks.push([0]);

            var lhs = PrairieGeom.blocksToMatrix(lhsBlocks);
            var rhs = PrairieGeom.blocksToMatrix(rhsBlocks);

            // take alpha1, alpha2, aP, aQ as given, solve for M, fP, fQ
            var lhsLeft = PrairieGeom.getColsArray2D(lhs, _.range(0, 6));
            var lhsRight = PrairieGeom.getColsArray2D(lhs, _.range(6, 11));

            var xTop = _.flatten([alpha1, alpha2, aP.elements, aQ.elements]);
            var svdRight = numeric.svd(lhsRight);
            if (_.min(svdRight.S) < 1e-5)
                continue;
            var rhsVec = numeric.sub(_.flatten(rhs), numeric.dot(lhsLeft, xTop));
            var UT = numeric.transpose(svdRight.U);
            var xBottom = numeric.dot(svdRight.V, numeric.div(numeric.dot(UT, rhsVec), svdRight.S));

            var xBottomSnap = _.map(xBottom, function(x) {return Math.round(x * 8) / 8;});
            var snapOK = (numeric.norminf(numeric.sub(xBottomSnap, xBottom)) < 1e-10);
            xBottom = xBottomSnap;
            var x = xTop.concat(xBottom);

            var vars = [
                {exp: "\\vec{\\alpha}_1", units: "rad/s^2", indexes: [0]},
                {exp: "\\vec{\\alpha}_2", units: "rad/s^2", indexes: [1]},
                {exp: "\\vec{a}_P",       units: "m/s^2",   indexes: [2, 3]},
                {exp: "\\vec{a}_Q",       units: "m/s^2",   indexes: [4, 5]},
                {exp: "\\vec{M}",         units: "N\\ m",   indexes: [6]},
                {exp: "\\vec{F}_P",       units: "N",       indexes: [7, 8]},
                {exp: "\\vec{F}_Q",       units: "N",       indexes: [9, 10]}
            ];

            var answerVar = rand.randInt(0, vars.length - 1);
            var difficulty = 2;
            var givenVars = rand.chooseGiven(difficulty, _(vars).pluck("indexes"), answerVar, lhs);
            if (givenVars != null)
                break;
        }

        _(vars).each(function(v) {
            v.values = PrairieGeom.getElemsArray(x, v.indexes);
            v.string = "";
        });
        _(givenVars).each(function(i) {
            var s = (vars[i].indexes.length === 1)
                ? PrairieTemplate.scalarProduct(vars[i].values[0], "\\hat{k}")
                : PrairieTemplate.cartesianVectorString(vars[i].values);
            vars[i].string = vars[i].exp + " &amp;= " + s + "{\\rm\\ " + vars[i].units + "}";
        });
        var givenString = PrairieTemplate.makeTeXArray([
            [vars[0].string, vars[1].string],
            [vars[2].string, vars[3].string],
            [vars[5].string, vars[6].string],
            [vars[4].string]
        ]);
		
		var matlabGivenStrings = ["alpha1", "alpha2", "aP", "aQ", "M", "Fp", "Fq"];
		var matlabGiven = "";
	    _(givenVars).each(function (i) {
			matlabGiven += matlabGivenStrings[i] + " = ";
			if (i == 0 || i == 1 || i == 4) 
				matlabGiven += vars[i].values[0].toString();
			else
				matlabGiven += "[" + vars[i].values.toString() + "]";
				matlabGiven += "\n";
		}); 

        var params = {
            m1: m1,
            m2: m2,
            I1: I1,
            I2: I2,
            eQN: eQN.elements,
            rOP: rOP.elements,
            rPQ: rPQ.elements,
            eQT: eQT.elements,
            eQN: eQN.elements,
            omega1: omega1,
            omega2: omega2,
            vP: vP.elements,
            vQ: vQ.elements,
            givenString: givenString,
            answerExp: vars[answerVar].exp,
            answerUnits: vars[answerVar].units,
            answerScalar: (vars[answerVar].values.length === 1),
			matlabGiven: matlabGiven
        };
        var trueAnswer = {
            answer: vars[answerVar].values,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
            options: {absTol: 1e-5},
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        if (params.answerScalar)
            return {answer: submittedAnswer.answer};
        else
            return {answer: [submittedAnswer.answerI, submittedAnswer.answerJ]};
    };

    return server;
});
