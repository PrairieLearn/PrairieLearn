define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "PrairieTemplate"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, PrairieTemplate) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid); 

        var QPos = rand.randElem(["left", "top", "right"]);
        var r = rand.randInt(2, 9);
        var s = rand.randSign();
        var omega = s * rand.randIntNonZero(2, 9);
        var vQ;
        if (QPos === "left") {
            vQ = $V([1, 1]).x(-s * rand.randInt(2, 9));
        } else if (QPos === "top") {
            vQ = $V([-s * rand.randInt(2, 9), 0]);
        } else if (QPos === "right") {
            vQ = $V([1, -1]).x(-s * rand.randInt(2, 9));
        }
        var defs = rand.randNElem(2, ["r", "omega"]);
        var givenDef = defs[0];
        var ansDef = defs[1];

        var ansVar, ansDescription, ansUnits;
        if (ansDef === "r" ) {
            r = null;
            ansVar = "r";
            ansDescription = "radius";
            ansUnits = "\\rm\\ m";
            ansScalar = true;
        } else if (ansDef === "omega") {
            omega = null;
            ansVar = "\\vec\\omega";
            ansDescription = "angular velocity";
            ansUnits = "\\,\\hat{k}\\rm\\ rad/s";
            ansScalar = true;
        }

		var matlabParams = "";
        var vQExp = "\\vec{v}_Q = " + PrairieTemplate.cartesianVectorString(vQ.elements) + "\\rm\\ m/s";
        var givenExp;
        if (givenDef === "r") {
            givenExp = "radius $r = " + r + "\\rm\\ m$";
		    matlabParams += "r = " + r.toString() + "\n";
	    }
        if (givenDef === "omega") {
            givenExp = "angular velocity $\\vec\\omega = " + PrairieTemplate.cartesianVectorString([0, 0, omega]) + "\\rm\\ rad/s$";
		    matlabParams += "omega = " + omega.toString() + "\n";
	    }
		
		matlabParams += "vQ = [" + vQ.elements[0].toString() + ", " + vQ.elements[1].toString() + ", 0]";

        var params = {
            QPos: QPos,
            r: r,
            vQ: vQ.elements,
            omega: omega,
            givenDef: givenDef,
            ansDef: ansDef,
            ansVar: ansVar,
            ansDescription: ansDescription,
            ansUnits: ansUnits,
            ansScalar: ansScalar,
            vQExp: vQExp,
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
        var vQDir = PrairieGeom.perp(rCQHat).add($V([-1, 0]));
        // now vQ = r * omega * vQDir
        var ans;
        if (params.ansDef === "r") {
            r = vQ.dot(vQDir) / omega / Math.pow(vQDir.modulus(), 2);
            ans = r;
        } else if (params.ansDef === "omega") {
            omega = vQ.dot(vQDir) / r / Math.pow(vQDir.modulus(), 2);
            ans = omega;
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
