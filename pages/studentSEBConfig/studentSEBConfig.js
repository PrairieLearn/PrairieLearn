var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
var path = require('path');

var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:assessment_id', function(req, res, next) {

    console.log(req.params.assessment_id);

    var params = { assessment_id: req.params.assessment_id };

    sqldb.queryZeroOrOneRow(sql.select_assessment, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.rows = result.rows;

        var a = result.rows[0];

        if (a) { //result.rows.length > 0) {
            var filename = 'config.seb';
            var sebFile = path.join(
                a.path,
                'courseInstances',
                a.ci_short_name,
                'assessments',
                a.tid
                );
            return res.sendFile(filename, {root: sebFile}, function(err) {
                if (ERR(err, next)) return;
            });
        } else {
            res.send("Unable to find SEB config");
        }
    });
});

module.exports = router;
