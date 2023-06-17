define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        this.pd.setUnits(10, 10 / this.pd.goldenRatio);

        var rOP = $V(this.params.get("rOP"));
        var rPQ = $V(this.params.get("rPQ"));
        var vQ = $V(this.params.get("vQ"));
        if (vQ.modulus() > 0.1)
            vQ = vQ.toUnitVector();

        var O = $V([0, 0]);
        var rP = rOP;
        var rQ = rOP.add(rPQ);
        var bbox = PrairieGeom.boundingBox2D([O, rP, rQ, rQ.add(vQ)]);

        var scale = Math.min(6 / bbox.extent.e(1), 6 / this.pd.goldenRatio / bbox.extent.e(2));
        rOP = rOP.x(scale);
        rPQ = rPQ.x(scale);
        rP = rOP;
        rQ = rOP.add(rPQ);
        bbox = PrairieGeom.boundingBox2D([O, rP, rQ, rQ.add(vQ)]);

        this.pd.save();
        this.pd.translate(bbox.center.x(-1));

        var w = 0.3;

        var base = O.subtract($V([0, 0.5]));
        this.pd.ground(base, $V([0, 1]), 1);
        this.pd.pivot(base, O, 1.5 * w);

        this.pd.rod(rP, rQ, w);
        this.pd.rod(O, rP, w);

        this.pd.point(O);
        this.pd.point(rP);
        this.pd.point(rQ);

        this.pd.labelIntersection(O, [base, rP], "TEX:$O$", 2);
        this.pd.labelIntersection(rP, [O, rQ], "TEX:$P$", 1.6);
        this.pd.labelIntersection(rQ, [rP, rQ.add(vQ)], "TEX:$Q$", 1.6);

        if (vQ.modulus() > 0.1) {
            this.pd.arrow(rQ, rQ.add(vQ), "velocity");
            this.pd.labelLine(rQ, rQ.add(vQ), $V([1, 0]), "TEX:$\\vec{v}_Q$");
        }

        var rOmega = 0.6;
        var dTheta = Math.PI / 4;
        var rOPAngle = PrairieGeom.angleOf(rOP);
        var rPQAngle = PrairieGeom.angleOf(rPQ);
        var circleSide = (PrairieGeom.intervalMod(rPQAngle - rOPAngle, -Math.PI, Math.PI) > 0) ? -1 : 1;

        this.pd.circleArrow(O, rOmega, rOPAngle - dTheta, rOPAngle + dTheta, "angVel", true);
        this.pd.circleArrow(rP, rOmega, rPQAngle - dTheta, rPQAngle + dTheta, "angVel", true);

        this.pd.labelCircleLine(O, rOmega, rOPAngle - dTheta, rOPAngle + dTheta, $V([1, 0]), "TEX:$\\omega_1$", true);
        this.pd.labelCircleLine(rP, rOmega, rPQAngle - dTheta, rPQAngle + dTheta, $V([circleSide, 0]), "TEX:$\\omega_2$", true);

        this.pd.restore();
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
