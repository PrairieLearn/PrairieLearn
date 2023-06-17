define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure", "PrairieGeom"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        var x = this.params.get("x");
        var trig = {
            fcn: this.params.get("trigFcn"),
            coeff: this.params.get("trigCoeff"),
            freq: this.params.get("trigFreq"),
        };
        
        this.pd.setUnits(6*Math.PI, 6*Math.PI / this.pd.goldenRatio);
        this.pd.save();
        this.pd.translate($V([-2.3*Math.PI, 0]));
        
        // axes
        this.pd.arrow($V([0, 0]), $V([4.5*Math.PI, 0]));
        this.pd.text($V([4.5*Math.PI, 0]), $V([0.5, 1.5]), "TEX:$x$");
        this.pd.arrow($V([0, 0]), $V([0, 4.5]));
        this.pd.text($V([0, 4.5]), $V([1.5, 0.5]), "TEX:$y$");
        this.pd.arrow($V([0, 0]), $V([0, -4.5]));
        
        var i, g = 0.15; // grid tick length;

        for (i = 1; i < 9; i += 1) {
            this.pd.line($V([i*Math.PI/2, 0]), $V([i*Math.PI/2, -g]));
        }
        this.pd.text($V([1 * Math.PI, -g]), $V([0, 1]), "TEX:$\\pi$");
        this.pd.text($V([2 * Math.PI, -g]), $V([0, 1]), "TEX:$2\\pi$");
        this.pd.text($V([3 * Math.PI, -g]), $V([0, 1]), "TEX:$3\\pi$");
        this.pd.text($V([4 * Math.PI, -g]), $V([0, 1]), "TEX:$4\\pi$");

        for (i = -3; i <= 3; i++) {
            this.pd.line($V([-g, i]), $V([0, i]));
        }
        this.pd.text($V([-g, -3]), $V([1, 0]), "TEX:$-3$");
        this.pd.text($V([-g, -2]), $V([1, 0]), "TEX:$-2$");
        this.pd.text($V([-g, -1]), $V([1, 0]), "TEX:$-1$");
        this.pd.text($V([-g,  0]), $V([1, 0]), "TEX:$0$");
        this.pd.text($V([-g,  1]), $V([1, 0]), "TEX:$1$");
        this.pd.text($V([-g,  2]), $V([1, 0]), "TEX:$2$");
        this.pd.text($V([-g,  3]), $V([1, 0]), "TEX:$3$");
        
        // curve
        this.pd.save();
        this.pd.setProp("shapeOutlineColor", this.pd.getProp("positionColor"));
        var curve = [], n = 300, cx;
        for (i = 0; i <= n; i++) {
            cx = (i / n) * 4 * Math.PI;
            curve.push($V([cx, PrairieGeom.evalTrig(trig, cx)]));
        }
        this.pd.polyLine(curve);
        this.pd.restore();
        
        // particle
        this.pd.save();
        this.pd.setProp("pointRadiusPx", 4);
        this.pd.point($V([x, PrairieGeom.evalTrig(trig, x)]));
        this.pd.restore();

        // gravity
        this.pd.arrow($V([15, 4]), $V([15, 1]), "acceleration");
        this.pd.labelLine($V([15, 4]), $V([15, 1]), $V([0, 1]), "TEX:$g$");

        this.pd.restore();
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
