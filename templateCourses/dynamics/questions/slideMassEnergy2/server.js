
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "underscore"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, _) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var v0 = rand.randInt(2, 15);
        var vf = rand.randInt(20, 39);
        var h = rand.randInt(2, 17);
        var ansVar = rand.randElem(["v_0", "v_{\\rm f}", "h"]);

        var ans, ansDesc, ansUnits;
        var g = 9.8;
        if (ansVar === "v_0") {
            v0 = null;
            ansDesc = "speed $v_0$ of the mass at the initial position on the slope";
            ansUnits = "m/s";
            ans = Math.sqrt(vf * vf - 2 * g * h);
        } else if (ansVar === "v_{\\rm f}") {
            vf = null;
            ansDesc = "speed $v_{\\rm f}$ of the mass at the bottom of the slope";
            ansUnits = "m/s";
            ans = Math.sqrt(v0 * v0 + 2 * g * h);
        } else if (ansVar === "h") {
            h = null;
            ansDesc = "initial height $h$ of the mass";
            ansUnits = "m";
            ans = 0.5 * (vf * vf - v0 * v0) / g;
        }

        var descs = [];
        if (ansVar !== "v_0")
            descs.push("speed of the mass at the initial position on the slope is $v_0 = " + v0 + "\\rm\\ m/s$");
        if (ansVar !== "v_{\\rm f}")
            descs.push("speed of the mass at the bottom of the slope is $v_{\\rm f} = " + vf + "\\rm\\ m/s$");
        if (ansVar !== "h")
            descs.push("initial height of the mass on the slope is $h = " + h + "\\rm\\ m$");
        rand.shuffle(descs);

        var params = {
            m: rand.randInt(2, 9),
            v0: v0,
            vf: vf,
            h: h,
            desc1: descs[0],
            desc2: descs[1],
            ansDesc: ansDesc,
            ansVar: ansVar,
            ansUnits: ansUnits,
            orient: rand.randSign(),
        };
        var trueAnswer = {
            ans: ans,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
