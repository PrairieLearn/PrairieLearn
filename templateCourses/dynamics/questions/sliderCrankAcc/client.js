define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        this.pd.setUnits(19, 19);

        var rOP = $V(this.params.get("rOP"));
        var rPQ = $V(this.params.get("rPQ"));
        var eQT = $V(this.params.get("eQT"));
        var eQN = $V(this.params.get("eQN"));

        var O = $V([0, 0]);
        var rP = rOP;
        var rQ = rOP.add(rPQ);
        var r = rOP.modulus();

        var len = 2;
        var wid = 0.5;
        var g00 = rQ.add(eQT.x(len)).add(eQN.x(wid));
        var g01 = rQ.add(eQT.x(len)).subtract(eQN.x(wid));
        var g10 = rQ.subtract(eQT.x(len)).add(eQN.x(wid));
        var g11 = rQ.subtract(eQT.x(len)).subtract(eQN.x(wid));

        var bbox = PrairieGeom.boundingBox2D([O.add($V([r, 0])), O.add($V([-r, 0])), O.add($V([0, r])), O.add($V([0, -r])), g00, g01, g10, g11]);

        this.pd.save();
        this.pd.translate(bbox.center.x(-1));

        this.pd.circle(O, r);

        var base = O.subtract($V([0, 0.7]));
        this.pd.ground(base, $V([0, 1]), 1);
        this.pd.pivot(base, O, 0.6);

        this.pd.point(O);
        var anchor = this.pd.findAnchorForIntersection(O, [rP, rQ, base, rP.add(rPQ.toUnitVector().x(r)), base.add($V([-0.5, 0])), base.add($V([0.5, 0]))]);
        this.pd.text(O, anchor.toUnitVector().x(1.6), "TEX:$O$");

        this.pd.ground(g00.add(g10).x(0.5), eQN.x(-1), 2 * len);
        this.pd.ground(g01.add(g11).x(0.5), eQN, 2 * len);

        this.pd.rod(rP, rQ, 0.4);

        this.pd.point(rP);
        this.pd.point(rQ);

        var tang = PrairieGeom.perp(rOP);
        this.pd.labelIntersection(rP, [O, rQ, rP.add(tang), rP.subtract(tang)], "TEX:$P$", 1.4);
        this.pd.labelIntersection(rQ, [rP, rQ.add(eQN), rQ.subtract(eQN)], "TEX:$Q$", 1.3);

        anchor = this.pd.findAnchorForIntersection(O, [rP, rQ]);
        anchor = anchor.toUnitVector();
        this.pd.text(anchor.x(-r), anchor.x(1.2), "TEX:$\\mathcal{B}_1$");

        this.pd.labelLine(rP, rQ, $V([0.2, 1.5]), "TEX:$\\mathcal{B}_2$");

        this.pd.restore();
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
