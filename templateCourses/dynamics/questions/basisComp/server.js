define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var thetaDeg = (rand.randInt(8, 14) * 5 + rand.randElem([0, 90])) * rand.randSign();
        var params = {
            thetaDeg: thetaDeg,
            thetaDegAbs: Math.abs(thetaDeg)
        };

        var theta = PrairieGeom.degToRad(thetaDeg);
        var u = PrairieGeom.vector2DAtAngle(theta);
        var v = PrairieGeom.perp(u);

        var trueAnswer = {
            u: u.elements,
            v: v.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {
            u: [submittedAnswer.ux, submittedAnswer.uy],
            v: [submittedAnswer.vx, submittedAnswer.vy],
        };
    };

    return server;
});
