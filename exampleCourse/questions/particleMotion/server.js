
define(["PrairieRandom", "PrairieGeom", "QServer"], function(PrairieRandom, PrairieGeom, QServer) {

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        // question parameters
        var F1 = 4 * rand.randInt(1, 3);
        var F2 = -4 * rand.randInt(1, 3);
        var m = 2 * rand.randInt(1, 2);
        var params = {
            F1: F1,
            F2: F2,
            m: m,
        };

        // correct answer to the question
        var FT = F1 + F2;
        var a = FT / m;
        var trueAnswer = {
            FT: FT,
            a: a,
        };

        // all the question data together
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    // OPTIONAL gradeAnswer() function
    // if not present, then the submittedAnswer will be automatically checked against the trueAnswer
    server.gradeAnswer = function(vid, params, trueAnswer, submittedAnswer) {
        var relTol = 1e-2;
        var absTol = 1e-8;
        var feedback = {};
        feedback.FTCorrect = false;
        feedback.aCorrect = false;
        if (PrairieGeom.checkEqual(trueAnswer.FT, submittedAnswer.FT, relTol, absTol)) {
            feedback.FTCorrect = true;
            feedback.FT = trueAnswer.FT;
        }
        if (PrairieGeom.checkEqual(trueAnswer.a, submittedAnswer.a, relTol, absTol)) {
            feedback.aCorrect = true;
            feedback.a = trueAnswer.a;
        }
        var score = 0;
        if (feedback.FTCorrect && feedback.aCorrect) {
            score = 1;
        }
        return {score: score, feedback: feedback};
    };

    return server;
});
