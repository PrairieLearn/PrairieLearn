define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        this.pd.setUnits(10, 10 / this.pd.goldenRatio);
        
        var rCQ = $V(this.params.get("rCQ")).toUnitVector();
        var vQ = $V(this.params.get("vQ")).toUnitVector();
        var radius = 2 / Math.max(rCQ.modulus(), Math.abs(rCQ.e(2) + vQ.e(2)));
        var rCQ = rCQ.x(radius);
        var vQ = vQ.x(radius);
        
        var O = $V([0, 0]);

        this.pd.ground(O.add($V([0, -radius])), $V([0, 1]), 12);
        this.pd.arc(O, radius);

        this.pd.point(O);
        this.pd.labelIntersection(O, [rCQ], "TEX:$C$");
        
        var tang = PrairieGeom.perp(rCQ);
        this.pd.point(rCQ);
        this.pd.labelIntersection(rCQ, [O, rCQ.add(vQ), rCQ.add(tang), rCQ.subtract(tang)], "TEX:$Q$");

        this.pd.arrow(O, rCQ, "position");
        this.pd.labelLine(O, rCQ, $V([0, 1]), "TEX:$\\vec{r}_{CQ}$");

        this.pd.arrow(rCQ, rCQ.add(vQ), "velocity");
        this.pd.labelLine(rCQ, rCQ.add(vQ), $V([1, 0]), "TEX:$\\vec{v}_Q$");
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
