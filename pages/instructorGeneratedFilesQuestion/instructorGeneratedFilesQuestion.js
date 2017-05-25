var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var questionServers = require('../../question-servers');

router.get('/variant_seed/:variant_seed/*', function(req, res, next) {
    var variant_seed = req.params.variant_seed;
    var filename = req.params[0];
    questionServers.getModule(res.locals.question.type, function(err, questionModule) {
        if (ERR(err, next)) return;
        questionServers.makeVariant(res.locals.question, res.locals.course, {variant_seed}, function(err, variant) {
            if (ERR(err, next)) return;
            questionModule.getFile(filename, variant, res.locals.question, res.locals.course, function(err, fileData) {
                if (ERR(err, next)) return;
                res.attachment(filename);
                res.send(fileData);
            });
        });
    });
});

module.exports = router;
