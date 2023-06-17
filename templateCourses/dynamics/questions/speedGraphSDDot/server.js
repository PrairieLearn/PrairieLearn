define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom"], function(QServer, PrairieRandom, Sylvester, PrairieGeom) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var dt = rand.randInt(2, 4);
        var v = [1, 3, 5, 7, 9];
        rand.shuffle(v);

        var vp = [], i;

        vp.push([0, v[0]]);
        vp.push([dt, v[1]]);
        for (i = 0; i < v.length - 3; i++) {
            vp.push([(1 + 2 * i) * dt, v[i + 1]]);
            vp.push([(2 + 2 * i) * dt, (v[i + 1] + v[i + 2]) / 2]);
            vp.push([(3 + 2 * i) * dt, v[i + 2]]);
        }
        vp.push([(2 * (v.length - 3) + 1) * dt, v[v.length - 2]]);
        vp.push([(2 * (v.length - 3) + 2) * dt, v[v.length - 1]]);

        var iAns = 3 * rand.randInt(1, v.length - 2);
        var t = vp[iAns][0];

        var params = {
            dt: dt,
            vp: vp,
            iAns: iAns,
            t: t
        };

        var t0 = vp[iAns - 1][0];
        var v0 = vp[iAns - 1][1];
        var t1 = vp[iAns][0];
        var v1 = vp[iAns][1];
        var sDDot = (v1 - v0) / (t1 - t0);

        var trueAnswer = {
            sDDot: sDDot,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
