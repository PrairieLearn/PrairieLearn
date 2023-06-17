define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        this.pd.setUnits(11, 11);

        var rPA = $V(this.params.get("rPA"));
        var rAQ = $V(this.params.get("rQA")).x(-1);
        var vP = $V(this.params.get("vP"));
        var vQ = $V(this.params.get("vQ"));
        var C = $V(this.params.get("C"));

        var P = $V([0, 0]);
        var A = P.add(rPA);
        var Q = A.add(rAQ);

        this.pd.save();
        this.pd.translate(C.x(-1));

        var w = 0.3;
        this.pd.rod(P, A, w);
        this.pd.rod(A, Q, w);
        this.pd.point(P);
        this.pd.point(A);
        this.pd.point(Q);
        this.pd.labelIntersection(P, [P.add(vP), A], "TEX:$P$", 1.5);
        this.pd.labelIntersection(A, [P, Q], "TEX:$A$", 1.5);
        this.pd.labelIntersection(Q, [Q.add(vQ), A], "TEX:$Q$", 1.5);

        this.pd.arrow(P, P.add(vP), "velocity");
        this.pd.arrow(Q, Q.add(vQ), "velocity");
        this.pd.labelLine(P, P.add(vP), $V([1, 0]), "TEX:$\\vec{v}_P$");
        this.pd.labelLine(Q, Q.add(vQ), $V([1, 0]), "TEX:$\\vec{v}_Q$");

        this.pd.restore();
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
