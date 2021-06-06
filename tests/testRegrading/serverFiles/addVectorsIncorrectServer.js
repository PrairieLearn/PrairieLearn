
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

        // trueAnswer is intentionally incorrect
        var wx = ux + vx - 1;
        var wy = uy + vy - 1;
        var trueAnswer = {
            wx: wx,
            wy: wy,
        };

        var options = {
            relTol: 0.01,
            absTol: 1e-8,
        };

        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
            options: options,
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
