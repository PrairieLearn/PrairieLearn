define(["sylvester", "text!./question.html", "text!./answer.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        this.pd.setUnits(10, 10 / this.pd.goldenRatio);

        var orient = this.params.get("orient");

        var h = 4;
        var d = 6;
        var dLeft = 1;
        var dRight = 2;
        var theta1 = 1/2 * Math.PI - orient * 5/6 * Math.PI;
        var c1 = 2;
        var c2 = 3;

        var B = $V([-orient * (d - dLeft * Math.abs(Math.cos(theta1)) + dRight) / 2, -(h + dLeft * Math.abs(Math.sin(theta1))) / 2]);
        var p1 = B.add($V([0, h]));
        var p0 = p1.subtract(PrairieGeom.vector2DAtAngle(theta1).x(dLeft));
        var p2 = p1.add(PrairieGeom.vector2DAtAngle(theta1).x(c1));
        var p4 = B.add($V([orient * d, 0]));
        var p3 = p4.add($V([-orient * c2, 0]));
        var p5 = p4.add($V([orient * dRight, 0]));
        this.pd.line(p0, p1);
        this.pd.cubicBezier(p1, p2, p3, p4);
        this.pd.line(p4, p5);

        this.pd.save();
        this.pd.setProp("shapeStrokePattern", "dashed");
        this.pd.line(B, p1);
        this.pd.line(B, p4);
        this.pd.labelLine(B, p1, $V([0, orient]), "TEX:$h$");
        this.pd.restore();

        var w = 0.3;
        this.pd.rectangle(w, w, p1.add(PrairieGeom.vector2DAtAngle(theta1 + orient * 1/4 * Math.PI).x(w / Math.sqrt(2))), theta1);
        this.pd.text(p1.add(PrairieGeom.vector2DAtAngle(theta1 + orient * 1/4 * Math.PI).x(w * Math.sqrt(2))), $V([-orient, 0]), "TEX:$m$");

        var gx = orient * ((d + dRight) / 2 - 1);
        var gy1 = h / 2;
        var gy2 = gy1 - 2;
        this.pd.arrow($V([gx, gy1]), $V([gx, gy2]), "acceleration");
        this.pd.labelLine($V([gx, gy1]), $V([gx, gy2]), $V([0, orient]), "TEX:$g$");
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
