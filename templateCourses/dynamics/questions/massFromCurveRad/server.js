
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var params = {
            vMag: rand.randInt(2, 7),
            FMag: rand.randInt(4, 9),
            rho: rand.randInt(10, 80),
        };

        var vMag = params.vMag;
        var FMag = params.FMag;
        var rho = params.rho;
        var m = FMag * rho / Math.pow(vMag, 2);

        var trueAnswer = {
            m: m,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
