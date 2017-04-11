define([], function() {

    var server = {};

    server.getData = function(vid, options, questionDir) {
        var params = {
            requiredFiles: (options.requiredFiles || []),
        };

        var trueAnswer = {};

        console.log(params)

        return {
            params: params,
            trueAnswer: trueAnswer,
        };
    };

    return server;
});
