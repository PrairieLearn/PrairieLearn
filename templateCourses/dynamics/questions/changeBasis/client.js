define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        var thetaDeg = this.params.get("thetaDeg");
        var theta = PrairieGeom.degToRad(thetaDeg);
        var r = $V(this.params.get("r"));

        var O = $V([0, 0]);
        var i = $V([1, 0]);
        var j = $V([0, 1]);
        var u = PrairieGeom.vector2DAtAngle(theta);
        var v = PrairieGeom.perp(u);

        var bbox = PrairieGeom.boundingBox2D([O, i, j, u, v, r]);

        this.pd.setUnits(5 * this.pd.goldenRatio, 5);
        this.pd.save();
        this.pd.translate(bbox.center.x(-1));

        this.pd.arrow(O, i);
        this.pd.arrow(O, j);
        this.pd.labelLine(O, i, $V([1, -1]), "TEX:$\\hat\\imath$");
        this.pd.labelLine(O, j, $V([1, 1]), "TEX:$\\hat\\jmath$");

        this.pd.arrow(O, u, "position");
        this.pd.arrow(O, v, "position");
        this.pd.labelLine(O, u, $V([1, -1]), "TEX:$\\hat{u}$");
        this.pd.labelLine(O, v, $V([1, 1]), "TEX:$\\hat{v}$");

        var rad = 0.2;
        this.pd.circleArrow(O, rad, 0, theta, undefined, true);
        this.pd.labelCircleLine(O, rad, 0, theta, $V([0, 1]), "TEX:$\\theta$", true);

        this.pd.arrow(O, r, "position");
        this.pd.labelLine(O, r, $V([1, 0]), "TEX:$\\vec{r}$");

        this.pd.restore();
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
