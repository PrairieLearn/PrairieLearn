define(["sylvester", "text!./question.html", "text!./answer.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        this.pd.setUnits(10, 10 / PrairieGeom.goldenRatio);

        var thetaSign = this.params.get("thetaSign");
        var theta = thetaSign * PrairieGeom.degToRad(45);

        var O = $V([0, 0]);
        var e = (theta > 0) ? $V([-1, 0]) : $V([1, 0]);
        var w = 1;
        var h = 10;
        var eu = PrairieGeom.vector2DAtAngle(theta);
        var ev = PrairieGeom.perp(eu);

        this.pd.rectangle(w, w, O, theta);
        this.pd.text(O, O, "TEX:$m$");
        this.pd.ground(ev.x(-w/2), ev, h / Math.abs(Math.sin(theta)));

        var ha = 1.5;
        var da = ha / Math.sin(theta);
        var rA = ev.x(-w/2).add(eu.x(-da));
        this.pd.save();
        this.pd.setProp("shapeStrokePattern", "dashed");
        this.pd.line(rA, rA.add(e.x(-3)));
        var td = 0.8 / Math.abs(Math.tan(theta));
        if (theta > 0)
            this.pd.arc(rA, td, 0, theta);
        else
            this.pd.arc(rA, td, Math.PI + theta, Math.PI);
        this.pd.text(rA.add(e.x(-td - 0.2)), $V([0, -1]), "TEX:$\\theta$");
        this.pd.restore();

        var gx = 3 * e.e(1), y1 = 1, y2 = 0;
        this.pd.arrow($V([gx, y1]), $V([gx, y2]), "acceleration");
        this.pd.labelLine($V([gx, y1]), $V([gx, y2]), $V([0, 1]), "TEX:$g$");
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
