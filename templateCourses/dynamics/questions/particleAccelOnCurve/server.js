define(["QServer", "PrairieRandom", "PrairieGeom"], function(QServer, PrairieRandom, PrairieGeom) {

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
        var xVeloc = rand.randElem([2, 4, 10]); //The horizontal velocity of the particle
        var xFuncType = rand.randInt(0, 1);
        var xFunc = ["sin", "cos"][xFuncType]; //The function of x being used
        var xFuncA = rand.randElem([-2, -1, 1, 2]); //A in y(x) = A cos(B x)
        var xFuncB; //B in y(x) = A cos(B x)
        if (Math.abs(xFuncA) === 2)
            xFuncB = rand.randElem([0.5, 1, 2]);
        else
            xFuncB = rand.randElem([1, 2]);
        var Q = rand.randBool(0.75) ? xFuncType : (1 - xFuncType); // Q = xFuncType ==> zero slope
        var xCoeff = rand.randInt(1, 4 * xFuncB - 1) / xFuncB + (1 - Q) / (2 * xFuncB); //gives x position when multiplied by pi
        
        var curvePos, yPos;
        if (xFunc === "sin")
            yPos = xFuncA*Math.sin(xFuncB*xCoeff*Math.PI);
        else
            yPos = xFuncA*Math.cos(xFuncB*xCoeff*Math.PI);
        if (Math.abs(yPos) < 0.01)
            curvePos = "middle";
        else if (yPos > 0)
            curvePos = "highest";
        else
            curvePos = "lowest";
        
        var curve = [], i;
        if (xFunc === "sin") {
            for (i = 0.0; i < 4.04*Math.PI; i += Math.PI/24) {
                curve.push([i, xFuncA*Math.sin(xFuncB*i)]);
            }
        }
        else {
            for (i = 0.0; i < 4.04*Math.PI; i += Math.PI/24) {
                curve.push([i, xFuncA*Math.cos(xFuncB*i)]);
            }
        }
        
        var params = {
            vDir: rand.randElem(["right", "left"]),
            xCoeff: xCoeff,
            yPos: yPos,
            xVeloc: xVeloc,
            curve: curve,
            xFunc: xFunc,
            xFuncA: xFuncA,
            xFuncB: xFuncB,
            curvePos: curvePos
        };

        var ay;
        if (xFunc === "sin")
            ay = -xFuncA*(xFuncB*xFuncB)*(xVeloc*xVeloc)*Math.sin(xFuncB*xCoeff*Math.PI);
        else
            ay = -xFuncA*(xFuncB*xFuncB)*(xVeloc*xVeloc)*Math.cos(xFuncB*xCoeff*Math.PI);
        ay = Math.round(ay); // ay must be an integer, so force it

        var trueAnswer = {
            ay: ay,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
