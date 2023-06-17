
define(["QServer", "PrairieRandom"], function(QServer, PrairieRandom) {

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);
//
//    Database of polar unit vectors and associated quadrant
        var unitVectorBank = [
//        Quadrant = 1
//         theta = 30
            {vec: "\\hat{e}_r      =  \\frac{\\sqrt{3}}{2} \\hat\\imath + \\frac{1}{2}        \\hat\\jmath",
             quadrant: "1"},
            {vec: "\\hat{e}_\\theta = -\\frac{1}{2}        \\hat\\imath + \\frac{\\sqrt{3}}{2} \\hat\\jmath",
             quadrant: "1"},
//         theta = 45
            {vec: "\\hat{e}_r      =  \\frac{1}{\\sqrt{2}} \\hat\\imath + \\frac{1}{\\sqrt{2}} \\hat\\jmath",
             quadrant: "1"},
            {vec: "\\hat{e}_\\theta = -\\frac{1}{\\sqrt{2}} \\hat\\imath + \\frac{1}{\\sqrt{2}} \\hat\\jmath",
             quadrant: "1"},
//         theta = 60
            {vec: "\\hat{e}_r      =  \\frac{1}{2} \\hat\\imath + \\frac{\\sqrt{3}}{2} \\hat\\jmath",
             quadrant: "1"},
            {vec: "\\hat{e}_\\theta = -\\frac{\\sqrt{3}}{2} \\hat\\imath + \\frac{1}{2} \\hat\\jmath",
             quadrant: "1"},
//        Quadrant = 2
//         theta = 120
            {vec: "\\hat{e}_r      = -\\frac{1}{2}        \\hat\\imath + \\frac{\\sqrt{3}}{2} \\hat\\jmath",
             quadrant: "2"},
            {vec: "\\hat{e}_\\theta = -\\frac{\\sqrt{3}}{2} \\hat\\imath - \\frac{1}{2}        \\hat\\jmath",
             quadrant: "2"},
//         theta = 135
            {vec: "\\hat{e}_r      = -\\frac{1}{\\sqrt{2}} \\hat\\imath + \\frac{1}{\\sqrt{2}} \\hat\\jmath",
             quadrant: "2"},
            {vec: "\\hat{e}_\\theta = -\\frac{1}{\\sqrt{2}} \\hat\\imath - \\frac{1}{\\sqrt{2}} \\hat\\jmath",
             quadrant: "2"},
//         theta = 130
            {vec: "\\hat{e}_r      = -\\frac{\\sqrt{3}}{2} \\hat\\imath + \\frac{1}{2}        \\hat\\jmath",
             quadrant: "2"},
            {vec: "\\hat{e}_\\theta = -\\frac{1}{2}        \\hat\\imath - \\frac{\\sqrt{3}}{2} \\hat\\jmath",
             quadrant: "2"},
//        Quadrant = 3
//         theta = 210
            {vec: "\\hat{e}_r      = -\\frac{\\sqrt{3}}{2} \\hat\\imath - \\frac{1}{2}        \\hat\\jmath",
             quadrant: "3"},
            {vec: "\\hat{e}_\\theta =  \\frac{1}{2}        \\hat\\imath - \\frac{\\sqrt{3}}{2} \\hat\\jmath",
             quadrant: "3"},
//         theta = 225
            {vec: "\\hat{e}_r      = -\\frac{1}{\\sqrt{2}} \\hat\\imath - \\frac{1}{\\sqrt{2}} \\hat\\jmath",
             quadrant: "3"},
            {vec: "\\hat{e}_\\theta =  \\frac{1}{\\sqrt{2}} \\hat\\imath - \\frac{1}{\\sqrt{2}} \\hat\\jmath",
             quadrant: "3"},
//         theta = 240
            {vec: "\\hat{e}_r      = -\\frac{1}{2}        \\hat\\imath - \\frac{\\sqrt{3}}{2} \\hat\\jmath",
             quadrant: "3"},
            {vec: "\\hat{e}_\\theta =  \\frac{\\sqrt{3}}{2} \\hat\\imath - \\frac{1}{2}        \\hat\\jmath",
             quadrant: "3"},
//        Quadrant = 4
//         theta = 300
            {vec: "\\hat{e}_r      =  \\frac{1}{2}        \\hat\\imath - \\frac{\\sqrt{3}}{2} \\hat\\jmath",
             quadrant: "4"},
            {vec: "\\hat{e}_\\theta =  \\frac{\\sqrt{3}}{2} \\hat\\imath + \\frac{1}{2}        \\hat\\jmath",
             quadrant: "4"},
//         theta = 315
            {vec: "\\hat{e}_r      =  \\frac{1}{\\sqrt{2}} \\hat\\imath - \\frac{1}{\\sqrt{2}} \\hat\\jmath",
             quadrant: "4"},
            {vec: "\\hat{e}_\\theta =  \\frac{1}{\\sqrt{2}} \\hat\\imath + \\frac{1}{\\sqrt{2}} \\hat\\jmath",
             quadrant: "4"},
//         theta = 330
            {vec: "\\hat{e}_r      =  \\frac{\\sqrt{3}}{2} \\hat\\imath - \\frac{1}{2}        \\hat\\jmath",
             quadrant: "4"},
            {vec: "\\hat{e}_\\theta =  \\frac{1}{2}        \\hat\\imath + \\frac{\\sqrt{3}}{2} \\hat\\jmath",
             quadrant: "4"}
//
        ];
//
//    Get random question
        var data = rand.randElem(unitVectorBank);
        var params = {
            vec: data.vec,
        };
        var trueAnswer = {
            quadrant: data.quadrant,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    return server;
});
