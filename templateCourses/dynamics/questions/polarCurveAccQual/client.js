define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {

        var curveC = this.params.get("curveC");
        var curveA = this.params.get("curveA");
        var curveB = this.params.get("curveB");
        var curveD = this.params.get("curveD");
        var curveF = this.params.get("curveF");
        var theta = this.params.get("theta");

        this.pd.setUnits(14, 14);

        var f = (curveF === "sin") ? Math.sin : Math.cos;
        var r = function(h) {
            return curveC + curveA * f(curveB * h + curveD);
        };

        var n = 200, i, h, points = [];
        for (i = 0; i < n; i++) {
            h = i / n * 2 * Math.PI;
            points.push(PrairieGeom.polarToRect($V([r(h), h])));
        }
        this.pd.polyLine(points, true);

        var O = $V([0, 0]);
        var P = PrairieGeom.polarToRect($V([r(theta), theta]));
        var P1 = PrairieGeom.polarToRect($V([r(theta + 0.1), theta + 0.1]));
        var P2 = PrairieGeom.polarToRect($V([r(theta - 0.1), theta - 0.1]));
        this.pd.point(P);
        this.pd.labelIntersection(P, [O, P1, P2], "TEX:$P$");

        this.pd.point(O);
        this.pd.text(O, $V([1, 1]), "TEX:$O$");
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
