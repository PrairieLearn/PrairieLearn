
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "underscore"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, _) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var a = $V(rand.randArrayIntNonZero(2, -5, 5));
        var aDot = $V(rand.randArrayIntNonZero(2, -5, 5));

        var aMag = a.modulus();
        var aHat = a.toUnitVector();
        var aMagDot = aDot.dot(aHat);
        var aHatDot = aDot.subtract(aHat.x(aDot.dot(aHat))).x(1 / aMag);

        var answerExp, answerUnits, answerScalar, answer;
        switch (rand.randInt(1, 21)) {
        case 1:
            answerExp = "\\left\\|\\frac{d}{dt}\\vec{a}(t)\\right\\|";
            answerUnits = "m/s";
            answerScalar = true;
            answer = aDot.modulus();
            break;
        case 2:
            answerExp = "\\frac{d}{dt}\\left\\|\\vec{a}(t)\\right\\|";
            answerUnits = "m/s";
            answerScalar = true;
            answer = aMagDot;
            break;
        case 3:
            answerExp = "\\frac{da(t)}{dt}";
            answerUnits = "m/s";
            answerScalar = true;
            answer = aMagDot;
            break;
        case 4:
            answerExp = "\\dot{\\hat{a}}(t)";
            answerUnits = "s^{-1}";
            answerScalar = false;
            answer = aHatDot;
            break;
        case 5:
            answerExp = "\\frac{d\\hat{a}(t)}{dt}";
            answerUnits = "s^{-1}";
            answerScalar = false;
            answer = aHatDot;
            break;
        case 6:
            answerExp = "\\frac{d}{dt}\\left(\\frac{\\vec{a}(t)}{a(t)}\\right)";
            answerUnits = "s^{-1}";
            answerScalar = false;
            answer = aHatDot;
            break;
        case 7:
            answerExp = "\\dot{\\vec{a}}(t) \\cdot \\hat{a}(t)";
            answerUnits = "m/s";
            answerScalar = true;
            answer = aDot.dot(aHat);
            break;
        case 8:
            answerExp = "\\dot{\\hat{a}}(t) \\cdot \\dot{\\vec{a}}(t)";
            answerUnits = "m/s^2";
            answerScalar = true;
            answer = aHatDot.dot(aDot);
            break;
        case 9:
            answerExp = "\\dot{\\hat{a}}(t) \\cdot \\vec{a}(t)";
            answerUnits = "m/s";
            answerScalar = true;
            answer = 0;
            break;
        case 10:
            answerExp = "\\frac{d}{dt}\\left(\\vec{a}(t) \\cdot \\vec{a}(t)\\right)";
            answerUnits = "m^2/s";
            answerScalar = true;
            answer = 2 * aMag * aMagDot;
            break;
        case 11:
            answerExp = "\\frac{d}{dt}\\left(a(t)\\right)^2";
            answerUnits = "m^2/s";
            answerScalar = true;
            answer = 2 * aMag * aMagDot;
            break;
        case 12:
            answerExp = "\\frac{d}{dt}\\left(\\vec{a}(t) \\cdot \\hat{a}(t)\\right)";
            answerUnits = "m/s";
            answerScalar = true;
            answer = aMagDot;
            break;
        case 13:
            answerExp = "\\frac{d}{dt}\\left(\\frac{\\vec{a}(t) \\cdot \\vec{a}(t)}{a(t)}\\right)";
            answerUnits = "m/s";
            answerScalar = true;
            answer = aMagDot;
            break;
        case 14:
            answerExp = "\\frac{d}{dt}\\left(\\hat{a}(t) \\cdot \\hat{a}(t)\\right)";
            answerUnits = "s^{-1}";
            answerScalar = true;
            answer = 0;
            break;
        case 15:
            answerExp = "\\frac{d}{dt}\\left(\\frac{\\vec{a}(t) \\cdot \\vec{a}(t)}{(a(t))^2}\\right)";
            answerUnits = "s^{-1}";
            answerScalar = true;
            answer = 0;
            break;
        case 16:
            answerExp = "\\frac{d}{dt} \\operatorname{Proj}\\left(\\vec{a}(t), \\hat{a}(t)\\right)";
            answerUnits = "m/s";
            answerScalar = false;
            answer = aDot;
            break;
        case 17:
            answerExp = "\\frac{d}{dt} \\left\\| \\operatorname{Proj}\\left(\\vec{a}(t), \\hat{a}(t)\\right) \\right\\|";
            answerUnits = "m/s";
            answerScalar = true;
            answer = aMagDot;
            break;
        case 18:
            answerExp = "\\frac{d}{dt}\\left(a(t) \\hat{a}(t)\\right)";
            answerUnits = "m/s";
            answerScalar = false;
            answer = aDot;
            break;
        case 19:
            answerExp = "\\frac{d}{dt}\\left\\|a(t) \\hat{a}(t)\\right\\|";
            answerUnits = "m/s";
            answerScalar = true;
            answer = aMagDot;
            break;
        case 20:
            answerExp = "\\frac{d}{dt} \\operatorname{Proj}\\left(\\hat{a}(t), \\vec{a}(t)\\right)";
            answerUnits = "s^{-1}";
            answerScalar = false;
            answer = aHatDot;
            break;
        case 21:
            answerExp = "\\frac{d}{dt} \\left\\|\\operatorname{Proj}\\left(\\hat{a}(t), \\vec{a}(t)\\right)\\right\\|";
            answerUnits = "s^{-1}";
            answerScalar = true;
            answer = 0;
            break;
        }

        var params = {
            a: a.elements,
            aDot: aDot.elements,
            answerExp: answerExp,
            answerUnits: answerUnits,
            answerScalar: answerScalar,
        };
        var trueAnswer = {
            answer: _.isNumber(answer) ? answer : answer.elements
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        if (params.answerScalar)
            return {answer: submittedAnswer.answer};
        else
            return {answer: [submittedAnswer.answerI, submittedAnswer.answerJ]};
    };

    return server;
});
