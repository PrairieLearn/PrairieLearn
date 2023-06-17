
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
		var matlabParams = "";
        var params = {
            rP: rand.randArrayIntNonZero(2, -5, 5),
            vP: rand.randArrayIntNonZero(2, -5, 5),
            omega: rand.randIntNonZero(-5, 5),
			matlabParams: matlabParams
        };
        
		params.matlabParams += "rP = [" + params.rP.toString() + ", 0]\n";
	    params.matlabParams += "vP = [" + params.vP.toString() + ", 0]\n";
		params.matlabParams += "omega = " + params.omega.toString();
		
        var rP = $V(params.rP);
        var vP = $V(params.vP);
        var omega = params.omega;

        var rPM = PrairieGeom.cross2D(omega, vP).x(1 / Math.pow(omega, 2));
        var rM = rP.add(rPM);

        var trueAnswer = {
            rM: rM.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {rM: [submittedAnswer.rMi, submittedAnswer.rMj]};
    };

    return server;
});
