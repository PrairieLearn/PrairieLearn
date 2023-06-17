
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

	var omega = rand.randIntNonZero(-5,5);
        var rPQ = $V(rand.randArrayIntNonZero(2, -5, 5));
        var vP = $V(rand.randArrayIntNonZero(2, -5, 5));
        var vQ = vP.add(PrairieGeom.cross2D(omega, rPQ));

        // shift vP and vQ to make them more centered
        var offset = vQ.subtract(vP);
        var halfOffset = $V([Math.round(offset.e(1) / 2), Math.round(offset.e(2) / 2)]);
        vP = vP.subtract(halfOffset);
        vQ = vQ.subtract(halfOffset);

	var params = {
            rPQ: rPQ.elements,
            vP: vP.elements,
            vQ: vQ.elements
	}
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
