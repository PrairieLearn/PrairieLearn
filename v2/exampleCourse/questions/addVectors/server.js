
define(["PrairieRandom", "PrairieGeom", "QServer"], function(PrairieRandom, PrairieGeom, QServer) {

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        // question parameters
        var ux = rand.randInt(5, 10);
        var uy = rand.randInt(5, 10);
        var vx = rand.randInt(5, 10);
        var vy = rand.randInt(5, 10);
        var params = {
            ux: ux,
            uy: uy,
            vx: vx,
            vy: vy,
        };

        // correct answer to the question
        var wx = ux + vx;
        var wy = uy + vy;
        var trueAnswer = {
            wx: wx,
            wy: wy,
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
        var score = 1;
        var feedback = {wx: '', wy: ''};
        if (!PrairieGeom.checkEqual(trueAnswer.wx, submittedAnswer.wx, options.relTol, options.absTol)) {
            score = 0;
            feedback.wx = 'The first component $w_x$ is incorrect.';
        }
        if (!PrairieGeom.checkEqual(trueAnswer.wy, submittedAnswer.wy, options.relTol, options.absTol)) {
            score = 0;
            feedback.wy = 'The second component $w_y$ is incorrect.';
        }
        return {score: score, feedback: feedback};
    };

    return server;
});
