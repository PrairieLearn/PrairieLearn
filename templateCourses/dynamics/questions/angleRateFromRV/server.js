
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var rLen = rand.randInt(2, 4);
        var vLen = rand.randInt(2, 4);
        var rAng = rand.randReal(0, 2 * Math.PI);
        var thetaDotSign = rand.randElem(["zero", "positive", "negative"]);
        var vAng;
        /* jshint indent: false */
        switch (thetaDotSign) {
        case "zero": vAng = rAng + rand.randElem([0, Math.PI]); break;
        case "positive": vAng = rAng + rand.randReal(1/6 * Math.PI, 5/6 * Math.PI); break;
        case "negative": vAng = rAng - rand.randReal(1/6 * Math.PI, 5/6 * Math.PI); break;
        }
        var r = PrairieGeom.polarToRect($V([rLen, rAng]));
        var v = PrairieGeom.polarToRect($V([vLen, vAng]));
        var rSide = rand.randElem([-1, 1]);
        var rCent = $V([rSide * 2.25, rand.randElem([-0.5, 0, 0.5])]);
        var vCent = $V([-rSide * 2.25, rand.randElem([-0.5, 0, 0.5])]);
        var rPos = rCent.subtract(r.x(0.5));
        var vPos = vCent.subtract(v.x(0.5));
        var params = {
            r: r.elements,
            v: v.elements,
            rPos: rPos.elements,
            vPos: vPos.elements,
        };
        var trueAnswer = {
            thetaDotSign: thetaDotSign,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
