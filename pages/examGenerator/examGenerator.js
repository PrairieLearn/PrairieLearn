var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var express = require('express');
var router = express.Router();
var debug = require('debug')('prairielearn:examGenerator');

var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET /');
    async.series([
        function(callback) {
            const params = {
                assessment_id: res.locals.assessment.id,
                numSds: 1,
                numBuckets: 10,
            };

            if (req.query.numSds) {
                params.numSds = req.query.numSds;
            }

            if (req.query.numBuckets) {
                params.numBuckets = req.query.numBuckets;
            }
            
            res.locals.numBuckets = params.numBuckets;

            sqldb.queryOneRow(sql.generated_score_new, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.result = result.rows[0].result;
                res.locals.quintile_result = result.rows[0].quintile_result;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, next)) return;
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});
module.exports = router;
