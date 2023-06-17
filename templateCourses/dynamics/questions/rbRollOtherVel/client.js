define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        this.pd.setUnits(10, 10 / this.pd.goldenRatio);

        var QPos = this.params.get("QPos");

        var radius = 2;
        var O = $V([0, 0]);
        var Q;
        if (QPos === "left") {
            Q = $V([-radius, 0]);
        } else if (QPos === "top") {
            Q = $V([0, radius]);
        } else if (QPos === "right") {
            Q = $V([radius, 0]);
        }

        this.pd.ground(O.add($V([0, -radius])), $V([0, 1]), 12);
        this.pd.arc(O, radius);

        this.pd.point(O);
        this.pd.text(O, $V([-1, 1]), "TEX:$C$");

        this.pd.point(Q);
        this.pd.labelIntersection(Q, [O], "TEX:$Q$");
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
