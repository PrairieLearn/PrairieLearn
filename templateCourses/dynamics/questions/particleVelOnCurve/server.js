define(["QServer", "PrairieRandom", "PrairieGeom"], function(QServer, PrairieRandom, PrairieGeom) {

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var xVeloc = rand.randElem([5, 10, 15, 20]); //The horizontal velocity of the particle
        if (rand.randBool())
            xVeloc = -xVeloc;
        var xFuncType = rand.randInt(0, 1);
        var xFunc = ["sin", "cos"][xFuncType]; //The function of x being used
        var xFuncA = rand.randElem([-2, -1, 1, 2]); //A in y(x) = A cos(B x)
        var xFuncB = rand.randElem([0.5, 1, 2]); //B in y(x) = A cos(B x)
        var Q = rand.randBool(0.25) ? xFuncType : (1 - xFuncType); // Q = xFuncType ==> zero slope
        var xCoeff = rand.randInt(1, 4 * xFuncB - 1) / xFuncB + (1 - Q) / (2 * xFuncB); //gives x position when multiplied by pi
        
        var curve = [], i;
        if (xFunc === "sin") {
            for (i = 0.0; i < 4.04*Math.PI; i += Math.PI/24) {
                curve.push([i, xFuncA*Math.sin(xFuncB*i)]);
            }
        } else {
            for (i = 0.0; i < 4.04*Math.PI; i += Math.PI/24) {
                curve.push([i, xFuncA*Math.cos(xFuncB*i)]);
            }
        }
        
        var params = {
            xCoeff: xCoeff,
            xVeloc: xVeloc,
            curve: curve,
            xFunc: xFunc,
            xFuncA: xFuncA,
            xFuncB: xFuncB
        };

        var vy;
        if (params.xFunc === "sin")
            vy = params.xFuncA*params.xFuncB*Math.cos(params.xFuncB*params.xCoeff*Math.PI)*params.xVeloc;
        else
            vy = -params.xFuncA*params.xFuncB*Math.sin(params.xFuncB*params.xCoeff*Math.PI)*params.xVeloc;
        if (Math.abs(vy * 8 - Math.round(vy * 8)) < 1e-10)
            vy = Math.round(vy * 8) / 8;

        var trueAnswer = {
            vy: vy,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
