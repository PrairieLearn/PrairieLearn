var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var question = require('../../lib/question');

router.get('/variant_seed/:variant_seed/*', function(req, res, next) {
    var variant_seed = req.params.variant_seed;
    var filename = req.params[0];
    question.makeVariant(res.locals.question, res.locals.course, {variant_seed}, function(err, courseErr, variant) {
        if (ERR(err, next)) return;
        question.getFile(filename, variant, res.locals.question, res.locals.course, function(err, fileData) {
            if (ERR(err, next)) return;
            res.attachment(filename);
            res.send(fileData);
        });
    });
});

module.exports = router;
