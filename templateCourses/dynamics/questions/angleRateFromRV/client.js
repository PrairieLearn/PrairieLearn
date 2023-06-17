
define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        this.pd.setUnits(9, 9 / this.pd.goldenRatio);
        var r = $V(this.params.get("r"));
        var v = $V(this.params.get("v"));
        var rPos = $V(this.params.get("rPos"));
        var vPos = $V(this.params.get("vPos"));
        this.pd.arrow(rPos, rPos.add(r), "position");
        this.pd.arrow(vPos, vPos.add(v), "velocity");
        this.pd.labelLine(rPos, rPos.add(r), $V([0, 1]), "TEX:$\\vec{r}$");
        this.pd.labelLine(vPos, vPos.add(v), $V([0, 1]), "TEX:$\\vec{v}$");
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
