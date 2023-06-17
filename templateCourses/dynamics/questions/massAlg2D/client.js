define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {

        var x1 = this.params.get("x1");
        var x2 = this.params.get("x2");
        var p1 = this.params.get("p1");
        var p2 = this.params.get("p2");

        var p = [], i, n = 20, x;
        for (i = 0; i <= n; i++) {
            x = PrairieGeom.linearInterp(x1, x2, i / n);
            p.push($V([x, PrairieGeom.evalPoly(p1, x)]));
        }
        for (i = 0; i <= n; i++) {
            x = PrairieGeom.linearInterp(x2, x1, i / n);
            p.push($V([x, PrairieGeom.evalPoly(p2, x)]));
        }

        var yMax = 1.2;

        var bbox = PrairieGeom.boundingBox2D(p);
        var pMax = Math.max(Math.abs(bbox.bottomLeft.e(2)), Math.abs(bbox.topRight.e(2)));
        for (i = 0; i < p.length; i++) {
            p[i] = $V([p[i].e(1), p[i].e(2) * yMax / pMax]);
        }

        this.pd.setUnits(6, 6 / this.pd.goldenRatio);

        this.pd.save();
        this.pd.setProp("shapeInsideColor", "rgb(240, 240, 240)");
        this.pd.polyLine(p, true, true);
        this.pd.restore();
        
        this.pd.arrow($V([-2.5, 0]), $V([2.5, 0]));
        this.pd.text($V([2.5, 0]), $V([0, 1.5]), "TEX:$x$");
        this.pd.arrow($V([0, -1.5]), $V([0, 1.5]));
        this.pd.text($V([0, 1.5]), $V([1.5, 0]), "TEX:$y$");
        
        var i, g = 0.15; // grid tick length;

        for (i = -2; i <= 2; i ++) {
            this.pd.line($V([i, 0]), $V([i, -g]));
        }
        this.pd.text($V([-2, -g]), $V([0, 1]), "TEX:$-2$");
        this.pd.text($V([-1, -g]), $V([0, 1]), "TEX:$-1$");
        this.pd.text($V([1, -g]), $V([0, 1]), "TEX:$1$");
        this.pd.text($V([2, -g]), $V([0, 1]), "TEX:$2$");
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
