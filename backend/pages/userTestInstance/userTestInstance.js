var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var assessment = require('../../assessment');
var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

router.get('/', function(req, res, next) {
    assessment.updateTestInstance(res.locals.testInstance, res.locals.test, res.locals.course, res.locals, function(err) {
        if (ERR(err, next)) return;
        assessment.renderTestInstance(res.locals.testInstance, res.locals, function(err, extraHeader, testInstanceHtml) {
            if (ERR(err, next)) return;
            res.locals.extraHeader = extraHeader;
            res.locals.testInstanceHtml = testInstanceHtml;
            res.render(path.join(__dirname, 'userTestInstance'), res.locals);
        });
    });
});

module.exports = router;
