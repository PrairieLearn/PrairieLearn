const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const error = require('@prairielearn/prairielib/error');
const logger = require('../../lib/logger');
const opsbot = require('../../lib/opsbot');

router.get('/', function(req, res, _next) {
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
