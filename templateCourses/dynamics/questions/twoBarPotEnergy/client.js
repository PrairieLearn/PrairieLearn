define(["sylvester", "text!./question.html", "text!./answer.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        this.pd.setUnits(10, 10 / this.pd.goldenRatio);

        var rOP = $V(this.params.get("rOP"));
        var rPQ = $V(this.params.get("rPQ"));

        var O = $V([0, 0]);
        var rP = rOP;
        var rQ = rOP.add(rPQ);
        var bbox = PrairieGeom.boundingBox2D([O, rP, rQ]);

        var scale = Math.min(6 / bbox.extent.e(1), 6 / this.pd.goldenRatio / bbox.extent.e(2));
        rOP = rOP.x(scale);
        rPQ = rPQ.x(scale);
        rP = rOP;
        rQ = rOP.add(rPQ);
        bbox = PrairieGeom.boundingBox2D([O, rP, rQ]);

        this.pd.save();
        this.pd.translate(bbox.center.x(-1));

        var w = 0.3;

        var base = O.subtract($V([0, 0.5]));
        this.pd.ground(base, $V([0, 1]), 1);
        this.pd.pivot(base, O, 1.5 * w);

        this.pd.rod(rP, rQ, w);
        this.pd.rod(O, rP, w);

        this.pd.point(O);
        this.pd.point(rP);
        this.pd.point(rQ);

        this.pd.labelIntersection(O, [base, rP], "TEX:$O$", 2);
        this.pd.labelIntersection(rP, [O, rQ], "TEX:$P$", 1.6);
        this.pd.labelIntersection(rQ, [rP], "TEX:$Q$", 1.6);

        var rCR = bbox.topRight.subtract(bbox.center);
        var rCS = $V([5, 5 / this.pd.goldenRatio]);
        var rCG = rCR.add(rCS).x(0.5);
        var rG = rCG.add(bbox.center);
        var gx = rG.e(1);
        var gy0 = rG.e(2);
        var gy1 = gy0 - 2;
        this.pd.arrow($V([gx, gy0]), $V([gx, gy1]), "acceleration");
        this.pd.labelLine($V([gx, gy0]), $V([gx, gy1]), $V([0, 1]), "TEX:$g$");

        this.pd.restore();
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
