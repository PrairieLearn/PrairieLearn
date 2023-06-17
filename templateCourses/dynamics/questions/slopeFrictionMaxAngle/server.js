
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var thetaSign = rand.randSign();

        var m = rand.randInt(3, 9);

        mu = rand.randInt(1, 15) / 8;

        var params = {
            thetaSign: thetaSign,
            m: m,
            mu: mu,
        };

        var theta = Math.atan(mu);
        var thetaDeg = PrairieGeom.radToDeg(theta);

        var trueAnswer = {
            thetaDeg: thetaDeg,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
