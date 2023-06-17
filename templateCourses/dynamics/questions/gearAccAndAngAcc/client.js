define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        this.pd.setUnits(70, 70 / this.pd.goldenRatio);

        var radii = this.params.get("radii");
        var angles = this.params.get("angles");
        var dir = this.params.get("dir");
        var PNum = this.params.get("PNum");
        var PAngle = this.params.get("PAngle");
        var QAngle = this.params.get("QAngle");

        var labels = [
            "TEX:$C_1$",
            "TEX:$C_2$",
            "TEX:$C_3$",
            "TEX:$C_4$",
        ];

        var centers = [$V([0, 0])];
        var i, r0, r1, angle;
        for (i = 1; i < radii.length; i++) {
            r0 = radii[i - 1];
            r1 = radii[i];
            angle = angles[i - 1];
            if (dir < 0)
                angle += Math.PI;
            centers.push(centers[i - 1].add(PrairieGeom.vector2DAtAngle(angle).x(r0 + r1)));
        }
        var otherPoints = [];
        for (i = 1; i < radii.length; i++) {
            otherPoints.push(null);
        }
        otherPoints[PNum - 1] = centers[PNum - 1].add(PrairieGeom.vector2DAtAngle(PAngle).x(radii[PNum - 1]));

        var points = [];
        for (i = 0; i < radii.length; i++) {
            points.push(centers[i].add($V([ radii[i], 0])));
            points.push(centers[i].add($V([-radii[i], 0])));
            points.push(centers[i].add($V([0,  radii[i]])));
            points.push(centers[i].add($V([0, -radii[i]])));
        }
        var bbox = PrairieGeom.boundingBox2D(points);

        this.pd.save();
        this.pd.translate(bbox.center.x(-1));

        for (i = 0; i < radii.length; i++) {
            this.pd.circle(centers[i], radii[i]);
            this.pd.point(centers[i]);
            if (otherPoints[i])
                this.pd.labelIntersection(centers[i], [otherPoints[i]], labels[i]);
            else
                this.pd.text(centers[i], $V([-1, 1]), labels[i]);
        }

        var that = this;
        var markPoint = function(num, angle, label) {
            var C = centers[num - 1];
            var r = radii[num - 1];
            var rCP = PrairieGeom.vector2DAtAngle(angle).x(r);
            var P = C.add(rCP);
            that.pd.point(P);
            that.pd.labelLine(P, P.add(rCP.toUnitVector()), $V([-1.1, 0]), label);
        };

        markPoint(PNum, PAngle, "TEX:$P$");

        this.pd.restore();
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
