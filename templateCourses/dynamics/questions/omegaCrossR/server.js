
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var quantity = rand.randElem([
            {name: "omegaR",
             label: "\\vec{v}",
             expr: "\\vec\\omega \\times \\vec{r}",
             units: "m/s"
            },
            {name: "omegaOmegaR",
             label: "\\vec{a}",
             expr: "\\vec\\omega \\times (\\vec\\omega \\times \\vec{r})",
             units: "m/s^2"
            },
            {name: "omegaRPerp",
             label: "\\vec{v}",
             expr: "\\omega \\vec{r}^\\perp",
             units: "m/s"
            },
            {name: "omegaOmegaRPerp",
             label: "\\vec{a}",
             expr: "-\\omega^2 \\vec{r}",
             units: "m/s^2"
            }
        ]);
        var params = {
            omega: rand.randIntNonZero(-4, 4),
            quantityName: quantity.name,
            quantityLabel: quantity.label,
            quantityExpr: quantity.expr,
            r: rand.randArrayIntNonZero(2, -5, 5)
        };

        var r = $V(params.r);
        var omega = params.omega;
        var qTrue;
        switch (params.quantityName) {
        case "omegaR":
        case "omegaRPerp":
            qTrue = PrairieGeom.cross2D(omega, r);
            break;
        case "omegaOmegaR":
        case "omegaOmegaRPerp":
            qTrue = PrairieGeom.cross2D(omega, PrairieGeom.cross2D(omega, r));
            break;
        }
        q = qTrue.to3D();

        var trueAnswer = {
            q: q.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {q: [submittedAnswer.qX, submittedAnswer.qY, submittedAnswer.qZ]};
    };

    return server;
});
