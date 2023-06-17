
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var params = {
            rFcn: rand.randArrayFunc(3),
            t: rand.randInt(0, 2)
        };

        var vFcn = PrairieGeom.diffFcnArray(params.rFcn);
        var vVec = $V(PrairieGeom.evalFcnArray(vFcn, params.t));
        var v = vVec.modulus();

        var trueAnswer = {
            v: v,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
