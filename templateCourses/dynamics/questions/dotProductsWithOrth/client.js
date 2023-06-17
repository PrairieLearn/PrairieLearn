define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        var a = $V(this.params.get("a"));
        var b = PrairieGeom.perp(a);

        var O = $V([0, 0]);

        var bbox = PrairieGeom.boundingBox2D([O, a, b]);

        this.pd.setUnits(9 * this.pd.goldenRatio, 9);
        this.pd.save();
        this.pd.translate(bbox.center.x(-1));

        this.pd.arrow(O, a, "position");
        this.pd.arrow(O, b, "position");
        this.pd.labelLine(O, a, $V([1, 0]), "TEX:$\\vec{a}$");
        this.pd.labelLine(O, b, $V([1, 0]), "TEX:$\\vec{b}$");
        this.pd.rightAngle(O, a, b);

        this.pd.restore();
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
