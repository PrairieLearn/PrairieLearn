var ERR = require('async-stacktrace');
var _ = require('lodash');
var express = require('express');
var router = express.Router();
var error = require('@prairielearn/prairielib/error');

router.get('/', function(req, res, next) {
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

module.exports = router;
