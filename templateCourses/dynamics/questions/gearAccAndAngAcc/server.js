
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "underscore"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, _) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var nGears = 4;

        var radiusChoices = [rand.randInt(5, 6), rand.randInt(6, 7), rand.randInt(7, 8), rand.randInt(8, 9)];
        var radii = rand.randNElem(nGears, radiusChoices);

        var angleChoices = [0, Math.PI / 6, -Math.PI / 6, rand.randSign() * Math.PI / 3];
        var angles = rand.randNElem(nGears - 1, angleChoices);

        var radiusExpList = _(radii).map(function(r, i) {return "$r_" + (i + 1) + " = " + r + " {\\rm\\ m}$";});
        var radiusExps = _.initial(radiusExpList).join(", ") + ", and " + radiusExpList[nGears - 1];

        var nums = rand.randNElem(4, [1, 2, 3, 4]);
        var givenANum = nums[0];
        var givenAngNum = nums[1];
        var givenDirNum = nums[2];
        var ansNum = nums[3];
        var PNum = givenANum;

        var givenChoice = rand.randElem(["omega", "alpha"]);
        var givenAngValue = rand.randInt(2, 9);

        var givenAngDescription, givenAngVar, givenAngUnits, ansDescription, ansVar, ansUnits, minAMag;
        if (givenChoice === "omega") {
            givenAngDescription = "angular velocity magnitude";
            givenAngVar = "\\omega_" + givenAngNum;
            givenAngUnits = "rad/s";
            ansDescription = "angular acceleration";
            ansVar = "\\vec\\alpha_" + ansNum;
            ansUnits = "rad/s^2";
            minAMag = Math.ceil(Math.pow(radii[givenAngNum - 1] * givenAngValue, 2) / radii[givenANum - 1]);
        } else {
            givenAngDescription = "angular acceleration magnitude";
            givenAngVar = "\\alpha_" + givenAngNum;
            givenAngUnits = "rad/s^2";
            ansDescription = "angular velocity";
            ansVar = "\\vec\\omega_" + ansNum;
            ansUnits = "rad/s";
            minAMag = radii[givenAngNum - 1] * Math.abs(givenAngValue);
        }
        var givenAMag = rand.randInt(minAMag + 2, 2 * (minAMag + 2));
		
		var matlabParams = "";
		for (i = 0; i < 4; i++) {
			matlabParams += "r" + (i+1).toString() + " = " + radii[i].toString() + "\n";
		}
		matlabParams += "aP = " + givenAMag.toString() + "\n";
		matlabParams += (givenChoice == "omega" ? "omega" : "alpha") + givenAngNum.toString() + "Mag";
		matlabParams += " = " + givenAngValue.toString();

        var params = {
            radii: radii,
            angles: angles,
            radiusExps: radiusExps,
            givenANum: givenANum,
            givenAngNum: givenAngNum,
            givenDirNum: givenDirNum,
            ansNum: ansNum,
            PNum: PNum,
            PAngle: rand.randInt(0, 23) / 24 * 2 * Math.PI,
            QAngle: rand.randInt(0, 23) / 24 * 2 * Math.PI,
            givenDirValue: rand.randSign(),
            givenDirRateChange: rand.randElem(["an increasing", "a decreasing"]),
            givenAMag: givenAMag,
            givenChoice: givenChoice,
            givenAngValue: givenAngValue,
            givenAngDescription: givenAngDescription,
            givenAngVar: givenAngVar,
            givenAngUnits: givenAngUnits,
            ansDescription: ansDescription,
            ansVar: ansVar,
            ansUnits: ansUnits,
			matlabParams: matlabParams
        };

        var givenAR = params.radii[params.givenANum - 1];
        var givenAngR = params.radii[params.givenAngNum - 1];
        var givenDirR = params.radii[params.givenDirNum - 1];
        var ansR = params.radii[params.ansNum - 1];
        var relDir = 1 - (Math.abs(params.ansNum - params.givenDirNum) % 2) * 2;
        var aOmega, aAlpha, ans;
        if (params.givenChoice === "omega") {
            aOmega = params.givenAngValue * givenAngR / givenAR;
            aAlpha = Math.pow(Math.pow(params.givenAMag / givenAR, 2) - Math.pow(aOmega, 4), 1/2);
            var aDir = params.givenDirValue * ((params.givenDirRateChange === "an increasing") ? 1 : -1);
            ans = aAlpha * givenAR / ansR * aDir * relDir;
        } else {
            aAlpha = params.givenAngValue * givenAngR / givenAR;
            aOmega = Math.pow(Math.pow(params.givenAMag / givenAR, 2) - Math.pow(aAlpha, 2), 1/4);
            ans = aOmega * givenAR / ansR * params.givenDirValue * relDir;
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
