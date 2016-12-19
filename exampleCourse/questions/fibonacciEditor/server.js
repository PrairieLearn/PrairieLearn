
define(["PrairieRandom", "PrairieGeom", "QServer"], function(PrairieRandom, PrairieGeom, QServer) {

    var server = new QServer();

    server.getData = function(vid) {
        var params = {
        };

        var trueAnswer = {
        };

        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };

        return questionData;
    };

    // OPTIONAL gradeAnswer() function
    // if not present, then the submittedAnswer will be automatically checked against the trueAnswer
    server.gradeAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {score: 1};
    };

    return server;
});
