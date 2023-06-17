define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        var a = $V(this.params.get("a"));
        var thetaCoeff = this.params.get("thetaCoeff");
        var thetaSign = this.params.get("thetaSign");
        var bLength = this.params.get("bLength");

        var theta = thetaSign * thetaCoeff[0] / thetaCoeff[1] * Math.PI;
        var bAngle = PrairieGeom.angleOf(a) + theta;
        var b = PrairieGeom.vector2DAtAngle(bAngle).x(bLength);

        var O = $V([0, 0]);

        var bbox = PrairieGeom.boundingBox2D([O, a, b]);

        this.pd.setUnits(9 * this.pd.goldenRatio, 9);
        this.pd.save();
        this.pd.translate(bbox.center.x(-1));

        this.pd.arrow(O, a, "position");
        this.pd.arrow(O, b, "position");
        this.pd.labelLine(O, a, $V([1, 0]), "TEX:$\\vec{a}$");
        this.pd.labelLine(O, b, $V([1, 0]), "TEX:$\\vec{b}$");

        var angleStart, angleEnd;
        if (PrairieGeom.cross2DOut(a, b) > 0) {
            angleStart = PrairieGeom.angleOf(a);
            angleEnd = PrairieGeom.angleOf(b);
        } else {
            angleStart = PrairieGeom.angleOf(b);
            angleEnd = PrairieGeom.angleOf(a);
        }
        if (angleEnd < angleStart)
            angleEnd += 2 * Math.PI;

        var rad = 0.6;
        this.pd.arc(O, rad, angleStart, angleEnd, false);
        this.pd.labelCircleLine(O, rad, angleStart, angleEnd, $V([0, 1]), "TEX:$\\theta$", true);

        this.pd.restore();
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
