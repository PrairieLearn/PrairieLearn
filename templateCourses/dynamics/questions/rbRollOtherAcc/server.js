define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "PrairieTemplate"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, PrairieTemplate) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid); 

        var QPos = rand.randElem(["left", "top", "right"]);
        var r = rand.randInt(2, 9);
        var omega = rand.randIntNonZero(2, 9);
        var s = rand.randSign();
        var alpha = s * rand.randIntNonZero(2, 9);
        var aQ;
        if (QPos === "left") {
            aQ = $V([1, 1]).x(-s * rand.randInt(2, 9)).add($V([rand.randInt(2, 9), 0]));
        } else if (QPos === "top") {
            aQ = $V([-s * rand.randInt(2, 9), 0]).add($V([0, -rand.randInt(2, 9)]));
        } else if (QPos === "right") {
            aQ = $V([1, -1]).x(-s * rand.randInt(2, 9)).add($V([-rand.randInt(2, 9), 0]));
        }
        var defs = rand.randNElem(2, ["r", "omega", "alpha"]);
        var givenDef = defs[0];
        var ansDef = defs[1];

        var ansVar, ansDescription, ansUnits;
        if (ansDef === "r" ) {
            ansVar = "r";
            ansDescription = "radius";
            ansUnits = "\\rm\\ m";
        } else if (ansDef === "omega") {
            ansVar = "|\\vec\\omega|";
            ansDescription = "angular velocity magnitude";
            ansUnits = "\\rm\\ rad/s";
        } else if (ansDef === "alpha") {
            ansVar = "\\vec\\alpha";
            ansDescription = "angular acceleration";
            ansUnits = "\\,\\hat{k}\\rm\\ rad/s^2";
        }
		
		var matlabParams = "";

        var aQExp = "\\vec{a}_Q" + " = " + PrairieTemplate.cartesianVectorString(aQ.elements) + "\\rm\\ m/s^2";;
        var givenExp;
        if (givenDef === "r") {
            givenExp = "radius $r = " + r + "\\rm\\ m$";
            omega = null;
            alpha = null;
			matlabParams += "r = " + r.toString() + "\n";
        }
        if (givenDef === "omega") {
            givenExp = "angular velocity $\\vec\\omega = " + PrairieTemplate.cartesianVectorString([0, 0, omega]) + "\\rm\\ rad/s$";
            r = null;
            alpha = null;
			matlabParams += "omega = [0, 0, " + omega.toString() + "]\n";
        }
        if (givenDef === "alpha") {
            givenExp = "angular acceleration $\\vec\\alpha = " + PrairieTemplate.cartesianVectorString([0, 0, alpha]) + "\\rm\\ rad/s^2$";
            r = null;
            omega = null;
			matlabParams += "alpha = [0, 0, " + alpha.toString() + "]\n";
        }
		
		matlabParams += "aQ = [" + aQ.elements.toString() + ", 0]";

        var params = {
            QPos: QPos,
            r: r,
            aQ: aQ.elements,
            omega: omega,
            alpha: alpha,
            givenDef: givenDef,
            ansDef: ansDef,
            ansVar: ansVar,
            ansDescription: ansDescription,
            ansUnits: ansUnits,
            aQExp: aQExp,
            givenExp: givenExp,
			matlabParams: matlabParams
        };

        var rCQHat;
        if (params.QPos === "left") {
            rCQHat = $V([-1, 0]);
        } else if (params.QPos === "top") {
            rCQHat = $V([0, 1]);
        } else if (params.QPos === "right") {
            rCQHat = $V([1, 0]);
        }
        var rCQHatPerp = PrairieGeom.perp(rCQHat);
        var rAlphaDir = rCQHatPerp.add($V([-1, 0]));
        var rAlphaDirPerp = PrairieGeom.perp(rAlphaDir);
        // now aQ = r * alpha * rAlphaDir - r * omega^2 * rCQHat
        if (params.givenDef === "r") {
            alpha = aQ.dot(rCQHatPerp) / r / rAlphaDir.dot(rCQHatPerp);
            omega = Math.sqrt(aQ.dot(rAlphaDirPerp) / (-r) / rCQHat.dot(rAlphaDirPerp));
        } else if (params.givenDef === "omega") {
            r = aQ.dot(rAlphaDirPerp) / (-Math.pow(omega, 2)) / rCQHat.dot(rAlphaDirPerp);
            alpha = aQ.dot(rCQHatPerp) / r / rAlphaDir.dot(rCQHatPerp);
        } else if (params.givenDef === "alpha") {
            r = aQ.dot(rCQHatPerp) / alpha / rAlphaDir.dot(rCQHatPerp);
            omega = Math.sqrt(aQ.dot(rAlphaDirPerp) / (-r) / rCQHat.dot(rAlphaDirPerp));
        }
        var ans;
        if (params.ansDef === "r") {
            ans = r;
        } else if (params.ansDef === "omega") {
            ans = omega;
        } else if (params.ansDef === "alpha") {
            ans = alpha;
        }

        var trueAnswer = {
            ans: ans,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
