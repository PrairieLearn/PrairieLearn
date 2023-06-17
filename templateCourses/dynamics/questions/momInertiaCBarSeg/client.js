define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {

        var width = this.params.get("width");
        var angle = this.params.get("angle");
        var rho1 = this.params.get("rho1");
        var rho2 = this.params.get("rho2");
        var rho3 = this.params.get("rho3");
        var l1 = this.params.get("l1");
        var l2 = this.params.get("l2");
        var l3 = this.params.get("l3");

        this.pd.setUnits(24, 24 / this.pd.goldenRatio);

        var length = l1 + l2 + l3;
        var u1 = PrairieGeom.vector2DAtAngle(angle);
        var u2 = PrairieGeom.perp(u1);

        var rhoMin = Math.min(rho1, rho2, rho3);
        var rhoMax = Math.max(rho1, rho2, rho3);
        var c1 = PrairieGeom.linearMap(rhoMin, rhoMax, 240, 200, rho1);
        var c2 = PrairieGeom.linearMap(rhoMin, rhoMax, 240, 200, rho2);
        var c3 = PrairieGeom.linearMap(rhoMin, rhoMax, 240, 200, rho3);
        c1 = Math.max(0, Math.min(255, Math.round(c1)));
        c2 = Math.max(0, Math.min(255, Math.round(c2)));
        c3 = Math.max(0, Math.min(255, Math.round(c3)));

        var x1 = -length / 2 + l1 / 2;
        var x2 = -length / 2 + l1 + l2 / 2;
        var x3 = -length / 2 + l1 + l2 + l3 / 2;

        this.pd.save();
        this.pd.setProp("shapeInsideColor", "rgb(" + c1 + "," + c1 + "," + c1 + ")");
        this.pd.rectangle(l1, width, u1.x(x1), angle, true);
        this.pd.setProp("shapeInsideColor", "rgb(" + c2 + "," + c2 + "," + c2 + ")");
        this.pd.rectangle(l2, width, u1.x(x2), angle, true);
        this.pd.setProp("shapeInsideColor", "rgb(" + c3 + "," + c3 + "," + c3 + ")");
        this.pd.rectangle(l3, width, u1.x(x3), angle, true);
        this.pd.restore();

        var g = 0.1;

        var P = u1.x(-length / 2).add(u2.x(-width / 2 - g));
        this.pd.measurement(P, P.add(u1.x(l1)), "TEX:$\\ell_1$");
        this.pd.measurement(P.add(u1.x(l1)), P.add(u1.x(l1 + l2)), "TEX:$\\ell_2$");
        this.pd.measurement(P.add(u1.x(l1 + l2)), P.add(u1.x(l1 + l2 + l3)), "TEX:$\\ell_3$");

        this.pd.measurement(u1.x(-length / 2 - g).add(u2.x(width / 2)), u1.x(-length / 2 - g).add(u2.x(-width / 2)), "TEX:$w$");
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
