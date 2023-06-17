define(["sylvester", "text!./question.html", "text!./answer.html", "text!./submission.html", "SimpleClient", "SimpleFigure"], function(Sylvester, questionTemplate, answerTemplate, submissionTemplate, SimpleClient, SimpleFigure) {
    var $V = Sylvester.Vector.create;

    var drawFcn = function() {
        var xCoeff = this.params.get("xCoeff");
        var curve = this.params.get("curve");
        var xFunc = this.params.get("xFunc");
        var xFuncA = this.params.get("xFuncA");
        var xFuncB = this.params.get("xFuncB");
        
        this.pd.setUnits(5.2*Math.PI, 5.2*Math.PI / this.pd.goldenRatio);
        this.pd.save();
        this.pd.translate($V([-2.1*Math.PI, 0]));
        
        //Set up axes
        this.pd.arrow($V([0, 0]), $V([4.5*Math.PI, 0]));
        this.pd.text($V([4.5*Math.PI, 0]), $V([0.5, 1.5]), "TEX:$x$");
        this.pd.arrow($V([0, 0]), $V([0, 3.5]));
        this.pd.text($V([0, 3.5]), $V([1.5, 0.5]), "TEX:$y$");
        this.pd.arrow($V([0, 0]), $V([0, -3.5]));
        
        var g = 0.15; // grid tick length;
        var i;
        for (i = 1; i < 9; i += 1) {
            this.pd.line($V([i*Math.PI/2, 0]), $V([i*Math.PI/2, -g]));
        }
        this.pd.text($V([1 * Math.PI, -g]), $V([0, 1]), "TEX:$\\pi$");
        this.pd.text($V([2 * Math.PI, -g]), $V([0, 1]), "TEX:$2\\pi$");
        this.pd.text($V([3 * Math.PI, -g]), $V([0, 1]), "TEX:$3\\pi$");
        this.pd.text($V([4 * Math.PI, -g]), $V([0, 1]), "TEX:$4\\pi$");

        for (i = -2; i <= 2; i++) {
            this.pd.line($V([-g, i]), $V([0, i]));
        }
        this.pd.text($V([-g, -2]), $V([1, 0]), "TEX:$-2$");
        this.pd.text($V([-g, -1]), $V([1, 0]), "TEX:$-1$");
        this.pd.text($V([-g,  0]), $V([1, 0]), "TEX:$0$");
        this.pd.text($V([-g,  1]), $V([1, 0]), "TEX:$1$");
        this.pd.text($V([-g,  2]), $V([1, 0]), "TEX:$2$");
        
        //Draw curve
        this.pd.setProp("shapeOutlineColor", this.pd.getProp("positionColor"));
        var vCurve = [];
        for (i = 0; i < curve.length; i++) {
            vCurve.push($V(curve[i]));
        }
        this.pd.polyLine(vCurve);
        
        //Draw particle
        this.pd.setProp("pointRadiusPx", 4);
        if (xFunc === "sin")
            this.pd.point($V([xCoeff*Math.PI, xFuncA*Math.sin(xFuncB*xCoeff*Math.PI)]));
        else
            this.pd.point($V([xCoeff*Math.PI, xFuncA*Math.cos(xFuncB*xCoeff*Math.PI)]));
        this.pd.restore();
    };

    var client = new SimpleClient.SimpleClient({questionTemplate: questionTemplate, answerTemplate: answerTemplate, submissionTemplate: submissionTemplate});

    client.on("renderQuestionFinished", function() {
        SimpleFigure.addFigure(client, "#figure1", drawFcn);
    });

    return client;
});
