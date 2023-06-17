define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var angleDeg = rand.randElem([0, 45, 90, 135]);
        var angle = PrairieGeom.degToRad(angleDeg);
        var slotSentence;
        switch (angleDeg) {
        case 0: slotSentence = "horizontal slot"; break;
        case 45: slotSentence = "slot at an angle of $45^\\circ$ to the horizontal"; break;
        case 90: slotSentence = "vertical slot"; break;
        case 135: slotSentence = "slot at an angle of $45^\\circ$ to the horizontal"; break;
        }

        var findSentence, findVar, findUnit;
        switch (rand.randElem(["omega", "aQ"])) {
        case "omega":
            findSentence = "the magnitude of the angular velocity of the body";
            findVar = "|\\omega|";
            findUnit = "rad/s";
            break;
        case "aQ":
            findSentence = "the magnitude of the velocity of point $Q$";
            findVar = "v_Q";
            findUnit = "m/s";
            break;
        }

        var r, theta, rPQ, vP, eQ, nTry, nAP, O, C, rectPointVec, rectPoint1, rectPoint2, bbox;
        nTry = 0;
        do {
            if (nTry++ > 1000)
                throw Exception("exceeded tries for configuration generation");

            r = rand.randReal(2, 4);
            theta = angle + rand.randElem([0, Math.PI]) + rand.randReal(-1/3 * Math.PI, 1/3 * Math.PI);
            rPQ = PrairieGeom.vectorRound(PrairieGeom.polarToRect($V([r, theta]))).x(rand.randSign());

            vP = $V(rand.randArrayIntNonZero(2, -3, 3));
            eQ = PrairieGeom.vector2DAtAngle(angle);
            eQPerp = PrairieGeom.perp(eQ);

            O = $V([0, 0]);
            C = rPQ.x(-0.5);
            rectPointVec = C.rotate(rand.randInt(1, 5) / 6 * Math.PI, O);
            rectPoint1 = C.add(rectPointVec);
            rectPoint2 = C.subtract(rectPointVec);
            rP = rPQ.x(-1);

            bbox = PrairieGeom.boundingBox2D([O, rP, rP.add(vP), rectPoint1, rectPoint2]);
        } while (bbox.extent.e(2) > 5 || bbox.extent.e(1) > 8 | Math.abs(rPQ.dot(eQ)) < 0.01 || Math.abs(vP.dot(rPQ)) < 0.01 || Math.abs(vP.dot(eQPerp)) < 0.01);

        var params = {
            angle: angle,
            slotSentence: slotSentence,
            findSentence: findSentence,
            findVar: findVar,
            findUnit: findUnit,
            rPQ: rPQ.elements,
            vP: vP.elements,
            rectPoint1: rectPoint1.elements,
            rectPoint2: rectPoint2.elements
        };

        var eQ = PrairieGeom.vector2DAtAngle(params.angle);

        var eQPerp = PrairieGeom.perp(eQ);
        var rPQPerp = PrairieGeom.perp(rPQ);
        var vQMag = Math.abs(vP.dot(rPQ) / eQ.dot(rPQ));
        var omega = Math.abs(vP.dot(eQPerp) / rPQPerp.dot(eQPerp));

        var answer = (params.findVar === "|\\omega|") ? omega : vQMag;

        var trueAnswer = {
            answer: answer,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
