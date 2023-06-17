define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid); 

        var pythTriples = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20], [7, 24, 25]];
        var triple = rand.randElem(pythTriples);
        var rCQElem = rand.randNElem(2, triple.slice(0, 2));
        var rCQ = $V([rand.randSign() * rCQElem[0], rand.randSign() * rCQElem[1]]);
        var r = triple[2];

        var omega = rand.randIntNonZero(-5, 5);
        var vQ = PrairieGeom.cross2D(omega, rCQ.add($V([0, r])));

        var params = {
            rCQ: rCQ.elements,
            vQ: vQ.elements
        };
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
