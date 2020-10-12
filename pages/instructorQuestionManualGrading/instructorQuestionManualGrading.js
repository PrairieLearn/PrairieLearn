const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();
const async = require('async');
const error = require('@prairielearn/prairielib/error');
const question = require('../../lib/question');
const sqldb = require('@prairielearn/prairielib/sql-db');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const logPageView = require('../../middlewares/logPageView')(path.basename(__filename, '.js'));

router.post('/', function(req, res, next) {
    // TODO: Look into adding manual grading action here--check what string we need
    // TODO: Add endpoint to mark this entire question as grade/ungraded/per variant
    //  and check if this dupluciates any logic in the instructor ui
    if (req.body.__action == 'grade') {
        // TODO: Hook this up to the manual grading "regrading" step
        // TODO: "pretty package" our partials for use by the backend pipleline
        // TODO: Add query string logic to set question state, i.e. graded or ungraded
        let variant_id, submitted_partials;
        if (res.locals.question.type == 'Freeform') {
            variant_id = req.body.__variant_id;
            submitted_partials = _.omit(req.body, ['__action', '__csrf_token', '__variant_id']);
            console.log(JSON.stringify(req));
        } else {
            return callback(error.make(400, 'Manual grading is only supported for freeform (V3) questions', {locals: res.locals, body: req.body}));
        }
        console.log(submitted_partials, JSON.stringify(submitted_partials));
    } else {
        next(error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
        }));
    }
});

router.get('/', function(req, res, next) {
    var variant_id = req.query.variant_id;
    debug(`manually grading variant_id ${variant_id}`);
    if (variant_id) {
        res.locals.overlayGradingInterface = true;
        async.series([
            (callback) => {
                question.getAndRenderVariant(variant_id, null, res.locals, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                logPageView(req, res, (err) => {
                    if (ERR(err, next)) return;
                    callback(null);
                });
            },
        ], (err) => {
            if (ERR(err, next)) return;
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    } else {
        return next(error.make(400, 'no variant provided', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
