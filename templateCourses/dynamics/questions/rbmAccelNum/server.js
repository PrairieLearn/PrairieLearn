
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var params = {
            omega: rand.randInt(-2, 2),
            alpha: rand.randInt(-2, 2),
            rPQ:   rand.randArrayIntNonZero(2, -5, 5),
            aP:    rand.randArrayInt(2, -5, 5)
        };

        var omega = params.omega;
        var alpha = params.alpha;
        var rPQ = $V(params.rPQ);
        var aP = $V(params.aP);
        var aQ = aP.add(PrairieGeom.cross2D(alpha, rPQ)).add(PrairieGeom.cross2D(omega,PrairieGeom.cross2D(omega,rPQ)));

        var trueAnswer = {
            aQ: aQ.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {aQ: [submittedAnswer.aQi, submittedAnswer.aQj]};
    };

    return server;
});
