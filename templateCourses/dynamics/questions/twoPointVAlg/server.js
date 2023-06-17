
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var params = {
            omega: rand.randIntNonZero(-2, 2),
            rPQ: rand.randArrayIntNonZero(2, -5, 5),
            vP: rand.randArrayInt(2, -5, 5)
        };

        var omega = params.omega;
        var rPQ = $V(params.rPQ);
        var vP = $V(params.vP);
        var vQ = vP.add(PrairieGeom.cross2D(omega, rPQ));

        var trueAnswer = {
            vQ: vQ.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {vQ: [submittedAnswer.vQi, submittedAnswer.vQj]};
    };

    return server;
});
