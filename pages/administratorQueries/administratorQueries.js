const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const async = require('async');
const moment = require('moment');
const { sqldb } = require('@prairielearn/prairielib');

router.get('/:dashboard([^/]*)?', function(req, res, next) {

    if (typeof req.params.dashboard == 'undefined') {
        res.redirect(req.baseUrl + '/main');
        return;
    }
    var dashboard = req.params.dashboard;
    res.locals.dashboardName = dashboard;
    res.locals.otherDashboards = [];
    res.locals.baseUrl = req.baseUrl;

    var params = {
        req_date: res.locals.req_date,
    };
    res.locals.queries = [];
    // Consider getting the data from the database (or formatted with the same sprocs)
    res.locals.req_date_present = moment(res.locals.req_date).format('llll');

    // Other dashboards
    fs.readdir(__dirname, { withFileTypes: true }, (err, files) => {
        if (ERR(err, next)) return;

        res.locals.otherDashboards = files
            .filter(file => file.isDirectory())
            .sort()
            .map(file => file.name);

        fs.readdir(path.join(__dirname, dashboard), (err, files) => {
            if (ERR(err, next)) return;

            const regex = /\.sql$/;
            files = files
                .filter(file => regex.test(file))
                .sort();

            async.eachSeries(files, (file, done) => {

                var sql = fs.readFileSync(path.join(__dirname, dashboard, file), 'utf8');
                sqldb.query(sql, params, function(err, result) {
                    if (ERR(err, done)) return;
                    result.SQLFilename = file;
                    result.SQLstring = sql;
                    res.locals.queries.push(result);
                    done();
                });
            }, (err) => {
                if (ERR(err, next)) return;
                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        });
    });
});

module.exports = router;
