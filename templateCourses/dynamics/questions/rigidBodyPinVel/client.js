define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        var rPQ = $V(this.params.get("rPQ"));
        var vP = $V(this.params.get("vP"));
        var rectPoint1 = $V(this.params.get("rectPoint1"));
        var rectPoint2 = $V(this.params.get("rectPoint2"));
        var angle = this.params.get("angle");

        this.pd.setUnits(10, 10 / this.pd.goldenRatio);

        var O = $V([0, 0]);
        var eQ = PrairieGeom.vector2DAtAngle(angle);
        var eQPerp = PrairieGeom.perp(eQ);
        var rP = rPQ.x(-1);
        var bbox = PrairieGeom.boundingBox2D([O, rP, rP.add(vP), rectPoint1, rectPoint2]);

        var slotWidth = 0.2;

        this.pd.save();
        this.pd.translate(bbox.center.x(-1));

        this.pd.line(eQPerp.x(slotWidth / 2).add(eQ.x(15)), eQPerp.x(slotWidth / 2).add(eQ.x(-15)));
        this.pd.line(eQPerp.x(-slotWidth / 2).add(eQ.x(15)), eQPerp.x(-slotWidth / 2).add(eQ.x(-15)));

        this.pd.polyLine([O, rectPoint1, rP, rectPoint2], true, false);
        this.pd.save();
        this.pd.setProp("pointRadiusPx", 3);
        this.pd.point(O);
        this.pd.restore();
        this.pd.point(rP);
        this.pd.labelIntersection(O, [eQ, eQ.x(-1), rectPoint1, rectPoint2], "TEX:$Q$", 1.5);
        this.pd.labelIntersection(rP, [rectPoint1, rectPoint2, rP.add(vP)], "TEX:$P$");

        this.pd.arrow(rP, rP.add(vP), "velocity");
        this.pd.labelLine(rP, rP.add(vP), $V([1, 0]), "TEX:$\\vec{v}_P$");

        this.pd.restore();
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        var figureView = SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
