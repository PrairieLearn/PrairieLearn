
define(["QServer", "PrairieRandom"], function(QServer, PrairieRandom) {

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
//
//    Database of basis derivative relations
        var basisVectorBank = [
//         ----- True -----
            {vec: "\\dot{\\hat{e}}_\\theta  = -\\dot{\\theta} \\, \\hat{e}_r",
             trueFalse: "true"},
            {vec: "\\dot{\\hat{e}}_\\theta  = -\\omega \\, \\hat{e}_r",
             trueFalse: "true"},
            {vec: "\\dot{\\hat{e}}_\\theta  =  \\vec{\\omega} \\times \\hat{e}_\\theta",
             trueFalse: "true"},
            {vec: "\\dot{\\hat{e}}_\\theta  =  \\dot{\\theta} \\, \\hat{e}_z \\times \\hat{e}_\\theta",
             trueFalse: "true"},
            {vec: "\\dot{\\hat{e}}_\\theta  =  \\omega \\, \\hat{e}_z \\times \\hat{e}_\\theta",
             trueFalse: "true"},
            {vec: "\\hat{e}_r             = -\\frac{1}{\\dot{\\theta}} \\, \\dot{\\hat{e}}_\\theta",
             trueFalse: "true"},
            {vec: "\\hat{e}_r             = -\\frac{1}{\\omega} \\, \\dot{\\hat{e}}_\\theta",
             trueFalse: "true"},
//         ----- False -----
            {vec: "\\hat{e}_\\theta        = -\\dot{\\theta} \\, \\hat{e}_r",
             trueFalse: "false"},
            {vec: "\\hat{e}_\\theta        = -\\omega \\, \\hat{e}_r",
             trueFalse: "false"},
            {vec: "\\dot{\\hat{e}}_\\theta  =  \\dot{\\theta} \\, \\hat{e}_r",
             trueFalse: "false"},
            {vec: "\\dot{\\hat{e}}_\\theta  =  \\omega \\, \\hat{e}_r",
             trueFalse: "false"},
            {vec: "\\hat{e}_r             =  \\frac{1}{\\dot{\\theta}} \\, \\dot{\\hat{e}}_\\theta",
             trueFalse: "false"},
            {vec: "\\hat{e}_r             =  \\frac{1}{\\omega} \\, \\dot{\\hat{e}}_\\theta",
             trueFalse: "false"},
            {vec: "-\\dot{\\theta}         =  \\frac{\\dot{\\hat{e}}_\\theta}{\\hat{e}_r}",
             trueFalse: "false"},
            {vec: "-\\omega               =  \\frac{\\dot{\\hat{e}}_\\theta}{\\hat{e}_r}",
             trueFalse: "false"},
            {vec: "\\dot{\\theta}          = -\\frac{\\dot{\\hat{e}}_\\theta}{\\hat{e}_r}",
             trueFalse: "false"},
            {vec: "\\omega                = -\\frac{\\dot{\\hat{e}}_\\theta}{\\hat{e}_r}",
             trueFalse: "false"},
            {vec: "\\dot{\\hat{e}}_\\theta  = -\\dot{\\theta} \\, \\hat{e}_r + \\theta \\, \\dot{\\hat{e}}_r",
             trueFalse: "false"},
            {vec: "\\dot{\\hat{e}}_\\theta  =  \\dot{\\theta} \\, \\hat{e}_r - \\theta \\, \\dot{\\hat{e}}_r",
             trueFalse: "false"},
            {vec: "\\dot{\\hat{e}}_\\theta  =  -\\omega \\, \\hat{e}_z \\times \\hat{e}_\\theta",
             trueFalse: "false"},
//
        ];
//
//    Get random question
        var data = rand.randElem(basisVectorBank);
        var params = {
            vec: data.vec,
        };
        var trueAnswer = {
            trueFalse: data.trueFalse,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
