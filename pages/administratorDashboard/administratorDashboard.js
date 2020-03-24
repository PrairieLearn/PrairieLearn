const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const async = require('async');
const moment = require('moment');
const { sqldb, sqlLoader } = require('@prairielearn/prairielib');

//var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {
        req_date: res.locals.req_date,
    };
    res.locals.queries = [];
    res.locals.req_date_present = moment(res.locals.req_date).format('llll');
    console.log(res.locals);

    fs.readdir(__dirname, (err, files) => {
        if (ERR(err, next)) return;

        const regex = /\.sql$/;
        files = files
            .filter(file => regex.test(file))
            .filter(file => file != 'administratorDashboard.sql')
            .sort();

        console.log(files);

    async.eachSeries(files, (file, done) => {

        var sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
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

module.exports = router;
