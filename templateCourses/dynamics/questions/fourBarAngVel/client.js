define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        this.pd.setUnits(4 * this.pd.goldenRatio, 4);

        var rAB = $V(this.params.get("rAB"));
        var rAD = $V(this.params.get("rAD"));
        var rBC = $V(this.params.get("rBC"));
        var O = $V([0, 0]);
        var rA = O;
        var rB = rA.add(rAB);
        var rC = rB.add(rBC);
        var rD = rA.add(rAD);
        var rDC = rC.subtract(rD);
        var bbox = PrairieGeom.boundingBox2D([rA, rB, rC, rD]);

        this.pd.save();
        this.pd.translate(bbox.center.x(-1));

        var w = 0.2;
        var a = 0.4;

        var rABase = rA.add($V([0, -a]));
        var rBBase = rB.add($V([0, -a]));

        this.pd.pivot(rABase, rA, w * 1.5);
        this.pd.pivot(rBBase, rB, w * 1.5);
        this.pd.ground(rABase, $V([0, 1]), 20);

        this.pd.rod(rA, rB, w);
        this.pd.rod(rC, rD, w);
        this.pd.rod(rA, rD, w);
        this.pd.rod(rB, rC, w);

        this.pd.point(rA);
        this.pd.point(rB);
        this.pd.point(rC);
        this.pd.point(rD);

        this.pd.labelIntersection(rA, [rB, rD, rABase], "TEX:$A$", 2);
        this.pd.labelIntersection(rB, [rA, rC, rBBase], "TEX:$B$", 2);
        this.pd.labelIntersection(rC, [rB, rD], "TEX:$C$", 1.5);
        this.pd.labelIntersection(rD, [rA, rC], "TEX:$D$", 1.5);

        var r = 0.5;
        var theta = Math.PI / 4;
        var rADAngle = PrairieGeom.angleOf(rAD);
        var rBCAngle = PrairieGeom.angleOf(rBC);
        var rDCAngle = PrairieGeom.angleOf(rDC);

        this.pd.circleArrow(rA, r, rADAngle - theta, rADAngle + theta, "angVel", true);
        this.pd.circleArrow(rB, r, rBCAngle - theta, rBCAngle + theta, "angVel", true);
        this.pd.circleArrow(rD, r, rDCAngle - theta, rDCAngle + theta, "angVel", true);

        this.pd.labelCircleLine(rA, r, rADAngle - theta, rADAngle + theta, $V([1, 0]), "TEX:$\\omega_1$", true);
        this.pd.labelCircleLine(rB, r, rBCAngle - theta, rBCAngle + theta, $V([1, 0]), "TEX:$\\omega_2$", true);
        this.pd.labelCircleLine(rD, r, rDCAngle - theta, rDCAngle + theta, $V([1, 0]), "TEX:$\\omega_3$", true);
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
