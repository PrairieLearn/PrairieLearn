var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
var path = require('path');
//var xml2js = require('xml2js');
const plist = require('plist');
var fs = require('fs');
const util = require('util');

var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:assessment_id', function(req, res, next) {

    //console.log(req.params.assessment_id);

    var params = { assessment_id: req.params.assessment_id };

    sqldb.queryZeroOrOneRow(sql.select_assessment, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.rows = result.rows;

        var a = result.rows[0];
        console.log(a);

        if (a) { //result.rows.length > 0) {

            var defobj = plist.parse(fs.readFileSync(__dirname + '/seb-def.seb', 'utf8'));
            //console.log(JSON.stringify(defobj));

            defobj['startURL'] = `http://endeavour.engr.illinois.edu:3000/pl/course_instance/${a.ci_id}/assessment/${a.a_id}`;
            defobj['browserUserAgent'] = a.a_uuid;
            defobj['browserUserAgentWinDesktopMode'] = 1;
            defobj['browserUserAgentMac'] = 1;
            defobj['browserUserAgentWinTouchMode'] = 1;

            //console.log(JSON.stringify(defobj, null, 4));
            return res.send(plist.build(defobj));
            
            var filename = 'config.seb';
            var sebFile = path.join(
                a.path,
                'courseInstances',
                a.ci_short_name,
                'assessments',
                a.tid
            );

            var obj = plist.parse(fs.readFileSync(sebFile + '/' + filename, 'utf8'));
            console.log(JSON.stringify(obj));


                return res.sendFile(filename, {root: sebFile}, function(err) {
                    if (ERR(err, next)) return;
                });

        } else {
            res.send("Unable to find SEB config");
        }
    });
});

module.exports = router;
