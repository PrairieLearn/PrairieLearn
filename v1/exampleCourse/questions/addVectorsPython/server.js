
define(["PrairieRandom", "QServer", "path", "child_process"], function(PrairieRandom, QServer, path, child_process) {

    var server = new QServer();

    server.getData = function(vid, options, questionDir) {
        var cmdInput = {
            vid: vid,
            options: options || {},
            questionDir: questionDir,
        };
        var input = JSON.stringify(cmdInput);
        var cmdOptions = {
            cwd: questionDir,
            input: input,
            timeout: 10000, // milliseconds
        };
        var cmd = 'python server.py getData';
        var outputBuffer = child_process.execSync(cmd, cmdOptions);
        var output = outputBuffer.toString();

        var questionData = JSON.parse(output); // needs to be {params: ..., trueAnswer: ..., options: ...}
        return questionData;
    };

    // OPTIONAL gradeAnswer() function
    // if not present, then the submittedAnswer will be automatically checked against the trueAnswer
    server.gradeAnswer = function(vid, params, trueAnswer, submittedAnswer, options, questionDir) {
        var cmdInput = {
            vid: vid,
            params: params,
            trueAnswer: trueAnswer,
            submittedAnswer: submittedAnswer,
            options: options,
        };
        var input = JSON.stringify(cmdInput);
        var cmdOptions = {
            cwd: questionDir,
            input: input,
            timeout: 10000, // milliseconds
        };
        var cmd = 'python server.py gradeAnswer';
        var outputBuffer = child_process.execSync(cmd, cmdOptions);
        var output = outputBuffer.toString();

        var grading = JSON.parse(output); // needs to be {score: ..., feedback: ...}
        return grading;
    };

    return server;
});
