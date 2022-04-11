const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/raw_data.json', function(req, res, next) {
    debug('GET /raw_data.json');
    const params = {
        assessment_id: res.locals.assessment.id, 
        group_work: res.locals.assessment.group_work,
    };
    sqldb.query(sql.select_assessment_instances, params, function(err, result) {
        if (ERR(err, next)) return;
        result.rows.forEach(function(row, idx) {
            sqldb.call('assessment_instances_select_log', [row.assessment_instance_id, false], (err, events) => {
                if (ERR(err, next)) return;
                //result.rows[idx].events = "";
                result.rows[idx].events = [];
                const included_events = ["Begin", "View assessment overview", "View variant", "Submission", "Close"]
                for (const event of events.rows) {
                    if (included_events.includes(event.event_name)) {
                        result.rows[idx].events.push({"name": event.event_name, "date": event.event_date, "qid": event.qid, "variant_id": event.variant_id});
                        //result.rows[idx].events += event.event_name + " (" + event.event_date + "): " + event.qid + " (" + event.variant_id + ")</br>";
                    }     
                }
                if (idx == result.rows.length - 1) res.send(result.rows);
            });
        });
        return;
    });
});

router.get('/client.js', function(req, res, _next) {
    debug('GET /client.js');
    res.render(__filename.replace(/\.js$/, 'ClientJS.ejs'), res.locals);
});

router.get('/', function(req, res, _next) {
    debug('GET /');
    debug('render page');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
});

module.exports = router;
