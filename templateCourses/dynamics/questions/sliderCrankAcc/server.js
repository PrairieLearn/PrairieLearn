
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "PrairieTemplate", "underscore", "numeric"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, PrairieTemplate, _, numeric) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var rOP = $V(rand.randElem([[1, 3], [1, 2]]));
        var xSign = rand.randSign();
        var rOP = $V([rOP.e(1) * xSign, rOP.e(2) * rand.randSign()]);
        var rPQ;
        if (rand.randBool()) {
            rPQ = $V([xSign * 8, rand.randInt(-4, 4)]);
        } else {
            rPQ = $V([-xSign * 12, rand.randInt(-4, 4)]);
        }

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
        var omega2 = rand.randIntNonZero(-3, 3);
        var omega1 = -omega2 * rPQ.dot(eQT) / rOP.dot(eQT);
        var vP = rOPPerp.x(omega1);
        var vQ = vP.add(rPQPerp.x(omega2));

        var alpha2 = rand.randIntNonZero(-3, 3);
        var alpha1 = (-alpha2 * rPQ.dot(eQT) + Math.pow(omega1, 2) * rOP.dot(eQN) + Math.pow(omega2, 2) * rPQ.dot(eQN)) / rOP.dot(eQT);
        var aP = rOPPerp.x(alpha1).subtract(rOP.x(Math.pow(omega1, 2)));
        var aQ = aP.add(rPQPerp.x(alpha2).subtract(rPQ.x(Math.pow(omega2, 2))));

        var vars = [
            {exp: "\\vec{\\alpha}_1", units: "rad/s^2", values: alpha1,      string: PrairieTemplate.scalarProduct(alpha1, "\\hat{k}")},
            {exp: "\\vec{\\alpha}_2", units: "rad/s^2", values: alpha2,      string: PrairieTemplate.scalarProduct(alpha2, "\\hat{k}")},
            {exp: "\\vec{a}_P",       units: "m/s^2",   values: aP.elements, string: PrairieTemplate.cartesianVectorString(aP.elements)},
            {exp: "\\vec{a}_Q",       units: "m/s^2",   values: aQ.elements, string: PrairieTemplate.cartesianVectorString(aQ.elements)},
        ];

        var givenInd, answerInd;
		var matlabGiven = "";
        if (rand.randBool()) {
            givenInd = 1;
            answerInd = rand.randElem([2, 3]);
			matlabGiven += "alpha2 = " + alpha2.toString();
        } else {
            givenInd = 3;
            answerInd = rand.randElem([0, 1, 2]);
	    	matlabGiven += "aQ = [" + aQ.elements.toString() + "]";
        }
		
        var params = {
            eQN: eQN.elements,
            rOP: rOP.elements,
            rPQ: rPQ.elements,
            eQT: eQT.elements,
            eQN: eQN.elements,
            omega1: omega1,
            omega2: omega2,
            vP: vP.elements,
            vQ: vQ.elements,
            givenExp: vars[givenInd].exp,
            givenUnits: vars[givenInd].units,
            givenString: vars[givenInd].string,
            answerExp: vars[answerInd].exp,
            answerUnits: vars[answerInd].units,
            answerScalar: _.isNumber(vars[answerInd].values),
			matlabGiven: matlabGiven
        };
        var trueAnswer = {
            answer: vars[answerInd].values,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
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
