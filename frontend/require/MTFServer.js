
define(["underscore", "QServer", "PrairieRandom"], function(_, QServer, PrairieRandom) {

    function MTFServer() {
        QServer.call(this);
    }
    MTFServer.prototype = new QServer();

    MTFServer.prototype.getData = function(vid, options) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        // Set some default values first.
        // Missing values should be caught by the schemas.
        options = _.defaults(options, {
            trueStatements: [],
            falseStatements: []
        });

        var numberTrue = options.trueStatements.length;
        var numberFalse = options.falseStatements.length;

        // TODO(tnip): This is kinda weird. We should be checking for
        // definedness on the full set. If empty, throw an error.
        //
        // Here, we want a list of all the statements so we can list them all.
        var allStatements = [];
        allStatements = allStatements.concat(options.trueStatements);
        allStatements = allStatements.concat(options.falseStatements);

        allStatements = _(allStatements).map(function(value, index) {
              return {key: 'q' + index.toString(), statement: value};
        });

        console.log(allStatements);

        var params = {
            statements: allStatements
        };

        var questionData = {
            params: params,
            trueAnswer: {}
        };

        return questionData;
    }

    /*
    MTFServer.prototype.transformTrueAnswer = function(vid, params, trueAns) {
        return {key: trueAns.key};
    }
    */

    return MTFServer;
});
