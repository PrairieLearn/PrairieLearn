var ERR = require('async-stacktrace');
var _ = require('lodash');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var opsbot = require('../../lib/opsbot');

router.get('/', function(req, res, next) {
    res.locals.showReportForm = true;
    res.locals.showSuccess = false;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function(req, res, next) {
    if (req.body.__action == 'report_cheating') {
        logger.verbose('cheating report', {locals: res.locals, body: req.body});
        res.locals.message = `Report of cheating: ${req.body.report}\nReporter email: ${req.body.email}`;
        opsbot.sendProctorMessage(res.locals.message, (err) => {
            if (ERR(err, next)) return;
            res.locals.showReportForm = false;
            res.locals.showSuccess = true;
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
