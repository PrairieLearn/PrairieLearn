var ERR = require('async-stacktrace');
var _ = require('lodash');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('@prairielearn/prairielib').error;
var sqldb = require('@prairielearn/prairielib').sqldb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {

    console.log(res.locals);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);

});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    if (req.body.__action == 'edit_total_score_perc') {
        let params = [
            req.body.assessment_instance_id,
            req.body.score_perc,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('assessment_instances_update_score_perc', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
