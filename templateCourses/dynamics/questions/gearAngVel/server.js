
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "underscore"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, _) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var nGears = rand.randInt(3, 4);

        var radiusChoices = [rand.randInt(5, 6), rand.randInt(6, 7), rand.randInt(7, 8), rand.randInt(8, 9)];
        var radii = rand.randNElem(nGears, radiusChoices);

        var angleChoices = [0, Math.PI / 6, -Math.PI / 6, rand.randSign() * Math.PI / 3];
        var angles = rand.randNElem(nGears - 1, angleChoices);

        var radiusExpList = _(radii).map(function(r, i) {return "$r_" + (i + 1) + " = " + r + " {\\rm\\ m}$";});
        var radiusExps = _.initial(radiusExpList).join(", ") + ", and " + radiusExpList[nGears - 1];

        var givenNum = rand.randElem([1, nGears]);
        var ansNum = nGears + 1 - givenNum;
		
        var params = {
            radii: radii,
            angles: angles,
            dir: rand.randSign(),
            radiusExps: radiusExps,
            givenNum: givenNum,
            ansNum: ansNum,
            givenCenter: "C_" + givenNum,
            ansCenter: "C_" + ansNum,
            givenOmegaVar: "\\vec\\omega_" + givenNum,
            ansOmegaVar: "\\vec\\omega_" + ansNum,
            givenOmega: rand.randSign() * rand.randInt(3, 9),
			matlabParams: ""
        };
		for (i = 0; i < nGears; i++) {
			params.matlabParams += "r" + (i+1).toString() + " = " + radii[i].toString() + "\n";
		}
        params.matlabParams += "omega" + givenNum + " = " + params.givenOmega.toString();

        var givenOmega = params.givenOmega;
        var givenRadius = params.radii[params.givenNum - 1];
        var ansRadius = params.radii[params.ansNum - 1];
        var ansOmega = givenOmega * givenRadius / ansRadius * ((nGears % 2) * 2 - 1);

        var trueAnswer = {
            ansOmega: ansOmega,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
