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
    if (req.body.__action == 'save') {
        // TODO: Hook this up to the manual grading "regrading" step
        // TODO: "pretty package" our partials for use by the backend pipleline
        // TODO: Add query string logic to set question state, i.e. graded or ungraded
        console.log("Recieved request");
    } else {
        next(error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
        }));
    }
});

router.get('/', function(req, res, next) {
    // TODO: require variant seed for a question in the route -- don't allow people to render a null callback
    const variant_id = '';
    const variant_seed = req.query.variant_seed;
    debug(`variant_seed ${variant_seed}`);
    // TODO: for manual mode, check for variant id--look into doing it as a route param
    async.series([
        (callback) => {
            question.getAndRenderVariant(variant_id, variant_seed, res.locals, function(err) {
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
});

module.exports = router;
