define(["QServer", "sylvester", "PrairieRandom", "PrairieGeom"], function(QServer, Sylvester, PrairieRandom, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var width = rand.randInt(2, 3);
        var rhos = rand.randNElem(3, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        var length = rand.randInt(15, 18);
        var l1 = rand.randInt(3, 6);
        var l2 = rand.randInt(3, 6);
        var l3 = length - l1 - l2;
        var lengths = [l1, l2, l3];
        rand.shuffle(lengths);

        var params = {
            angle: rand.randSign() * (rand.randIntNonZero(1, 3) / 18 * Math.PI + rand.randElem([0, Math.PI])),
            width: width,
            rho1: rhos[0],
            rho2: rhos[1],
            rho3: rhos[2],
            l1: lengths[0],
            l2: lengths[1],
            l3: lengths[2],
        };

        var rho1 = params.rho1;
        var rho2 = params.rho2;
        var rho3 = params.rho3;
        var l1 = params.l1;
        var l2 = params.l2;
        var l3 = params.l3;

        var m1 = rho1 * width * l1;
        var m2 = rho2 * width * l2;
        var m3 = rho3 * width * l3;
        var m = m1 + m2 + m3;

        var C1 = $V([l1 / 2, width / 2]);
        var C2 = $V([l1 + l2 / 2, width / 2]);
        var C3 = $V([l1 + l2 + l3 / 2, width / 2]);
        var C = C1.x(m1).add(C2.x(m2)).add(C3.x(m3)).x(1 / m);

        var I1 = 1/12 * m1 * (width * width + l1 * l1);
        var I2 = 1/12 * m2 * (width * width + l2 * l2);
        var I3 = 1/12 * m3 * (width * width + l3 * l3);
        var IC = I1 + m1 * Math.pow(C1.subtract(C).modulus(), 2)
            + I2 + m2 * Math.pow(C2.subtract(C).modulus(), 2)
            + I3 + m3 * Math.pow(C3.subtract(C).modulus(), 2);

        var trueAnswer = {
            IC: IC,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
