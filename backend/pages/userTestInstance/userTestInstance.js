var ERR = require('async-stacktrace');
var _ = require('underscore');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var assessment = require('../../assessment');
var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'userTestInstance.sql'));

router.get('/', function(req, res, next) {
    assessment.updateTestInstance(req.locals.testInstance, req.locals.test, req.locals.course, req.locals, function(err) {
        if (ERR(err, next)) return;
        assessment.renderTestInstance(req.locals.testInstance, req.locals, function(err, extraHeader, testInstanceHtml) {
            if (ERR(err, next)) return;
            var locals = _.extend({
                extraHeader: extraHeader,
                testInstanceHtml: testInstanceHtml,
            }, req.locals);
            res.render(path.join(__dirname, 'userTestInstance'), locals);
        });
    });
});

module.exports = router;
