
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        do {
            var r = $V(rand.randArrayIntNonZero(3, -5, 5));
            var omega = $V(rand.randArrayIntNonZero(3, -3, 3));
            var params = {
                x: r.e(1),
                y: r.e(2),
                z: r.e(3),
                omega: omega.elements,
            };
        } while ($V(params.omega).cross(r).modulus() < 1);

        var v = omega.cross(r);

        var trueAnswer = {
            v: v.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {v: [submittedAnswer.vi, submittedAnswer.vj, submittedAnswer.vk]};
    };

    return server;
});
