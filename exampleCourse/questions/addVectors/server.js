
define(["PrairieRandom", "PrairieGeom"], function(PrairieRandom, PrairieGeom) {

    var server = {};

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        // question parameters
        var ax = rand.randInt(5, 10);
        var ay = rand.randInt(5, 10);
        var bx = rand.randInt(5, 10);
        var by = rand.randInt(5, 10);
        var params = {
            ax: ax,
            ay: ay,
            bx: bx,
            by: by,
        };

        // correct answer to the question
        var cx = ax + bx;
        var cy = ay + by;
        var trueAnswer = {
            cx: cx,
            cy: cy,
        };

        // OPTIONAL, if missing then
        // relTol = 0.01 and absTol = 1e-8 will be used
        var options = {
            relTol: 0.01, // relative tolerance for checking answers (OPTIONAL)
            absTol: 1e-8, // absolute tolerance (OPTIONAL)
        };

        // all the question data together
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
            options: options, // OPTIONAL
        };
        return questionData;
    };

    // OPTIONAL gradeAnswer() function
    // if not present, then the submittedAnswer will be automatically checked against the trueAnswer
    server.gradeAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        var score = 0;
        if (PrairieGeom.checkEqual(trueAnswer, submittedAnswer, options.relTol, options.absTol))
            score = 1;
        return {score: score};
    };

    return server;
});
