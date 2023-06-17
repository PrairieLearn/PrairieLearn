
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "underscore"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, _) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var v0 = rand.randInt(2, 15);
        var vf = rand.randInt(20, 39);
        var h = rand.randInt(10, 27);
        var ansChoice = rand.randElem(["v0", "vf", "h"]);

        var ansVar, ansDesc, ansUnits;
        if (ansChoice === "v0") {
            v0 = null;
            ansVar = "v_{C,0}";
            ansDesc = "speed $v_{C,0}$ of the hoop center at the initial position on the slope";
            ansUnits = "m/s";
        } else if (ansChoice === "vf") {
            vf = null;
            ansVar = "v_{C,\\rm f}";
            ansDesc = "speed $v_{C,\\rm f}$ of the hoop center at the bottom of the slope";
            ansUnits = "m/s";
        } else if (ansChoice === "h") {
            h = null;
            ansVar = "h";
            ansDesc = "initial height $h$ of the hoop center";
            ansUnits = "m";
        }

        var descs = [];
        if (ansChoice !== "v0")
            descs.push("speed of the hoop center at the initial position on the slope is $v_{C,0} = " + v0 + "\\rm\\ m/s$");
        if (ansChoice !== "vf")
            descs.push("speed of the hoop center at the bottom of the slope is $v_{C,\\rm f} = " + vf + "\\rm\\ m/s$");
        if (ansChoice !== "h")
            descs.push("initial height of the hoop center on the slope is $h = " + h + "\\rm\\ m$");
        rand.shuffle(descs);

        var params = {
            m: rand.randInt(2, 9),
            r: rand.randInt(2, 5),
            v0: v0,
            vf: vf,
            h: h,
            desc1: descs[0],
            desc2: descs[1],
            ansChoice: ansChoice,
            ansDesc: ansDesc,
            ansVar: ansVar,
            ansUnits: ansUnits,
            orient: rand.randSign(),
        };

        var r = params.r;
        var g = 9.8;
        var ans;
        if (params.ansChoice === "v0") {
            ans = Math.sqrt(vf * vf - g * (h - r));
        } else if (params.ansChoice === "vf") {
            ans = Math.sqrt(v0 * v0 + g * (h - r));
        } else if (params.ansChoice === "h") {
            ans = (vf * vf - v0 * v0) / g + r;
        }

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
